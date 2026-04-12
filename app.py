from flask import Flask, render_template, request, jsonify, redirect, url_for
from models import db, Staff, ChecklistItem, ChecklistLog, DailyNote, \
    InventoryCategory, InventoryItem, InventoryTransaction, ShortageItem, ShortageCount
from datetime import datetime, date, timedelta
import os
import json

app = Flask(__name__)
basedir = os.path.abspath(os.path.dirname(__file__))
db_path = os.path.join(basedir, 'instance', 'smp.db')
os.makedirs(os.path.dirname(db_path), exist_ok=True)
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)


# ─── Pages ───────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('checklist.html')


@app.route('/inventory')
def inventory_page():
    return render_template('inventory.html')


@app.route('/manage')
def manage_index():
    # redirect straight to the 운영 (checklist) view to remove the selection step
    return redirect(url_for('manage_checklist'))

@app.route('/manage/checklist')
def manage_checklist():
    return render_template('admin.html', active='checklist')

@app.route('/manage/inventory')
def manage_inventory_page():
    return render_template('admin.html', active='inventory')

@app.route('/manage/settings')
def manage_settings():
    return render_template('admin.html', active='settings')


# ─── Staff API ───────────────────────────────────────────

@app.route('/api/staff')
def get_staff():
    staff = Staff.query.filter_by(active=True).order_by(Staff.sort_order).all()
    return jsonify([{'id': s.id, 'name': s.name} for s in staff])


@app.route('/api/staff', methods=['POST'])
def add_staff():
    data = request.json
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name required'}), 400
    existing = Staff.query.filter_by(name=name).first()
    if existing:
        existing.active = True
        db.session.commit()
        return jsonify({'ok': True, 'id': existing.id})
    s = Staff(name=name, sort_order=Staff.query.count())
    db.session.add(s)
    db.session.commit()
    return jsonify({'ok': True, 'id': s.id})


@app.route('/api/staff/<int:staff_id>', methods=['DELETE'])
def remove_staff(staff_id):
    s = Staff.query.get_or_404(staff_id)
    s.active = False
    db.session.commit()
    return jsonify({'ok': True})


# ─── Checklist API ───────────────────────────────────────

@app.route('/api/checklist/<shift>')
def get_checklist(shift):
    target_date = request.args.get('date', date.today().isoformat())
    target_date = date.fromisoformat(target_date)

    items = ChecklistItem.query.filter_by(shift=shift, active=True)\
        .order_by(ChecklistItem.sort_order).all()

    result = []
    for item in items:
        log = ChecklistLog.query.filter_by(item_id=item.id, date=target_date).first()
        result.append({
            'id': item.id,
            'name': item.name,
            'completed': log.completed if log else False,
            'completed_by': log.completed_by if log else None,
            'completed_at': log.completed_at.strftime('%H:%M') if log and log.completed_at else None,
        })
    return jsonify(result)


@app.route('/api/checklist/check', methods=['POST'])
def check_item():
    data = request.json
    item_id = data['item_id']
    completed = data['completed']
    staff = data.get('staff_name', '')
    target_date = date.fromisoformat(data.get('date', date.today().isoformat()))

    log = ChecklistLog.query.filter_by(item_id=item_id, date=target_date).first()
    if log:
        log.completed = completed
        log.completed_by = staff if completed else None
        log.completed_at = datetime.now() if completed else None
    else:
        log = ChecklistLog(
            item_id=item_id, date=target_date, completed=completed,
            completed_by=staff if completed else None,
            completed_at=datetime.now() if completed else None,
        )
        db.session.add(log)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/checklist/summary')
def checklist_summary():
    start = request.args.get('start', (date.today() - timedelta(days=7)).isoformat())
    end = request.args.get('end', date.today().isoformat())
    start_date = date.fromisoformat(start)
    end_date = date.fromisoformat(end)

    results = []
    current = start_date
    while current <= end_date:
        for shift in ['day', 'night']:
            total = ChecklistItem.query.filter_by(shift=shift, active=True).count()
            done = ChecklistLog.query.join(ChecklistItem)\
                .filter(ChecklistLog.date == current,
                        ChecklistLog.completed == True,
                        ChecklistItem.shift == shift,
                        ChecklistItem.active == True).count()
            results.append({
                'date': current.isoformat(),
                'shift': shift,
                'total': total,
                'done': done,
            })
        current += timedelta(days=1)
    return jsonify(results)

# Checklist priorities persistence (simple JSON file)
PRIO_FILE = os.path.join(basedir, 'instance', 'checklist_priorities.json')

def _load_priorities():
    try:
        with open(PRIO_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def _save_priorities(pr):
    os.makedirs(os.path.dirname(PRIO_FILE), exist_ok=True)
    with open(PRIO_FILE, 'w', encoding='utf-8') as f:
        json.dump(pr, f, ensure_ascii=False)

@app.route('/api/checklist/priorities')
def get_priorities():
    return jsonify(_load_priorities())

@app.route('/api/checklist/priorities', methods=['POST'])
def set_priority():
    data = request.json or {}
    item_id = str(data.get('id') or data.get('item_id') or '')
    priority = data.get('priority')
    if not item_id or priority is None:
        return jsonify({'error': 'id and priority required'}), 400
    pr = _load_priorities()
    pr[item_id] = priority
    _save_priorities(pr)
    return jsonify({'ok': True})


# ─── Checklist management API (create/update/delete/reorder) ───────────────────────────
@app.route('/api/checklist/item', methods=['POST'])
def create_checklist_item():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    shift = data.get('shift', 'day')
    if not name:
        return jsonify({'error': 'Name required'}), 400
    max_order = db.session.query(db.func.max(ChecklistItem.sort_order)).filter_by(shift=shift).scalar() or 0
    item = ChecklistItem(name=name, shift=shift, sort_order=(max_order + 1), active=True)
    db.session.add(item)
    db.session.commit()
    return jsonify({'ok': True, 'id': item.id})

@app.route('/api/checklist/item/<int:item_id>', methods=['PUT'])
def update_checklist_item(item_id):
    data = request.json or {}
    item = ChecklistItem.query.get_or_404(item_id)
    if 'name' in data:
        item.name = (data.get('name') or '').strip()
    if 'shift' in data:
        item.shift = data.get('shift')
    if 'active' in data:
        item.active = bool(data.get('active'))
    if 'sort_order' in data:
        try:
            item.sort_order = int(data.get('sort_order'))
        except:
            pass
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/checklist/item/<int:item_id>', methods=['DELETE'])
def delete_checklist_item(item_id):
    item = ChecklistItem.query.get_or_404(item_id)
    # soft-delete by marking inactive
    item.active = False
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/checklist/reorder', methods=['POST'])
def reorder_checklist():
    data = request.json or {}
    shift = data.get('shift')  # optional: restrict to a shift
    order = data.get('order', [])
    if not isinstance(order, list):
        return jsonify({'error': 'order must be a list of item ids'}), 400
    for idx, iid in enumerate(order):
        it = ChecklistItem.query.get(iid)
        if not it:
            continue
        if shift and it.shift != shift:
            continue
        it.sort_order = idx
    db.session.commit()
    return jsonify({'ok': True})

# ─── Inventory reorder endpoints (categories/items)
@app.route('/api/inventory/categories/reorder', methods=['POST'])
def reorder_categories():
    data = request.json or {}
    order = data.get('order', [])
    if not isinstance(order, list):
        return jsonify({'error': 'order must be a list of category ids'}), 400
    for idx, cid in enumerate(order):
        cat = InventoryCategory.query.get(cid)
        if not cat:
            continue
        cat.sort_order = idx
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/inventory/items/reorder', methods=['POST'])
def reorder_inventory_items():
    data = request.json or {}
    category_id = data.get('category_id')
    order = data.get('order', [])
    if not isinstance(order, list):
        return jsonify({'error': 'order must be a list of item ids'}), 400
    for idx, iid in enumerate(order):
        it = InventoryItem.query.get(iid)
        if not it:
            continue
        if category_id and it.category_id != category_id:
            continue
        it.sort_order = idx
    db.session.commit()
    return jsonify({'ok': True})

# ─── Daily Notes API ─────────────────────────────────────

@app.route('/api/notes/<shift>/<note_type>')
def get_note(shift, note_type):
    target_date = request.args.get('date', date.today().isoformat())
    target_date = date.fromisoformat(target_date)
    note = DailyNote.query.filter_by(date=target_date, shift=shift, type=note_type).first()
    return jsonify({
        'content': note.content if note else '',
        'updated_by': note.updated_by if note else None,
        'updated_at': note.updated_at.strftime('%H:%M') if note and note.updated_at else None,
    })


@app.route('/api/notes/<shift>/<note_type>', methods=['POST'])
def save_note(shift, note_type):
    data = request.json
    target_date = date.fromisoformat(data.get('date', date.today().isoformat()))
    content = data.get('content', '')
    staff = data.get('staff_name', '')

    note = DailyNote.query.filter_by(date=target_date, shift=shift, type=note_type).first()
    if note:
        note.content = content
        note.updated_by = staff
        note.updated_at = datetime.now()
    else:
        note = DailyNote(
            date=target_date, shift=shift, type=note_type,
            content=content, updated_by=staff, updated_at=datetime.now(),
        )
        db.session.add(note)
    db.session.commit()
    return jsonify({'ok': True})


# ─── Inventory API ───────────────────────────────────────

@app.route('/api/inventory')
def get_inventory():
    categories = InventoryCategory.query.order_by(InventoryCategory.sort_order).all()
    result = []
    for cat in categories:
        items = InventoryItem.query.filter_by(category_id=cat.id)\
            .order_by(InventoryItem.sort_order).all()
        result.append({
            'id': cat.id,
            'name': cat.name,
            'items': [{
                'id': item.id,
                'name': item.name,
                'quantity': item.quantity,
                'min_threshold': item.min_threshold,
                'location': item.location,
                'low_stock': item.quantity <= item.min_threshold,
                'updated_at': item.updated_at.strftime('%m/%d %H:%M') if item.updated_at else None,
                'updated_by': item.updated_by,
            } for item in items]
        })
    return jsonify(result)


@app.route('/api/inventory/all-items')
def all_inventory_items():
    """All items sorted alphabetically for dropdown search."""
    items = InventoryItem.query.join(InventoryCategory)\
        .order_by(InventoryItem.name).all()
    return jsonify([{
        'id': item.id,
        'name': item.name,
        'category': item.category.name,
        'quantity': item.quantity,
        'location': item.location or '',
    } for item in items])


@app.route('/api/inventory/item', methods=['POST'])
def create_inventory_item():
    data = request.json
    cat_id = data['category_id']
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name required'}), 400
    max_order = db.session.query(db.func.max(InventoryItem.sort_order))\
        .filter_by(category_id=cat_id).scalar() or 0
    item = InventoryItem(
        category_id=cat_id, name=name,
        quantity=data.get('quantity', 0),
        min_threshold=data.get('min_threshold', 2),
        location=data.get('location', ''),
        sort_order=max_order + 1,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({'ok': True, 'id': item.id})


@app.route('/api/inventory/<int:item_id>', methods=['PUT'])
def update_inventory(item_id):
    data = request.json
    item = InventoryItem.query.get_or_404(item_id)
    staff = data.get('staff_name', '')

    if 'name' in data:
        item.name = data['name']
    if 'location' in data:
        item.location = data['location']
    if 'category_id' in data:
        item.category_id = data['category_id']

    new_qty = data.get('quantity')
    if new_qty is not None:
        diff = new_qty - item.quantity
        if diff != 0:
            tx = InventoryTransaction(
                item_id=item.id, type='in' if diff > 0 else 'out',
                quantity=abs(diff), note=data.get('note', ''), created_by=staff,
            )
            db.session.add(tx)
        item.quantity = new_qty
        item.updated_at = datetime.now()
        item.updated_by = staff

    if 'min_threshold' in data:
        item.min_threshold = data['min_threshold']

    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/inventory/<int:item_id>', methods=['DELETE'])
def delete_inventory_item(item_id):
    item = InventoryItem.query.get_or_404(item_id)
    InventoryTransaction.query.filter_by(item_id=item_id).delete()
    db.session.delete(item)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/inventory/<int:item_id>/transaction', methods=['POST'])
def add_transaction(item_id):
    data = request.json
    item = InventoryItem.query.get_or_404(item_id)
    tx_type = data['type']
    qty = int(data['quantity'])
    staff = data.get('staff_name', '')

    if tx_type == 'in':
        item.quantity += qty
    else:
        item.quantity = max(0, item.quantity - qty)

    item.updated_at = datetime.now()
    item.updated_by = staff

    tx = InventoryTransaction(
        item_id=item.id, type=tx_type, quantity=qty,
        note=data.get('note', ''), created_by=staff,
    )
    db.session.add(tx)
    db.session.commit()
    return jsonify({'ok': True, 'new_quantity': item.quantity})


@app.route('/api/inventory/<int:item_id>/history')
def get_history(item_id):
    txs = InventoryTransaction.query.filter_by(item_id=item_id)\
        .order_by(InventoryTransaction.created_at.desc()).limit(20).all()
    return jsonify([{
        'type': tx.type,
        'quantity': tx.quantity,
        'note': tx.note,
        'created_at': tx.created_at.strftime('%m/%d %H:%M') if tx.created_at else None,
        'created_by': tx.created_by,
    } for tx in txs])


@app.route('/api/inventory/item-detail/<int:item_id>')
def get_item_detail(item_id):
    item = InventoryItem.query.get_or_404(item_id)
    return jsonify({
        'id': item.id,
        'name': item.name,
        'category_id': item.category_id,
        'quantity': item.quantity,
        'min_threshold': item.min_threshold,
        'location': item.location or '',
    })


@app.route('/api/inventory/low-stock')
def low_stock():
    items = InventoryItem.query.filter(
        InventoryItem.quantity <= InventoryItem.min_threshold
    ).order_by(InventoryItem.name).all()
    return jsonify([{
        'id': item.id,
        'name': item.name,
        'quantity': item.quantity,
        'min_threshold': item.min_threshold,
        'category': item.category.name,
    } for item in items])


@app.route('/api/inventory/categories')
def get_categories():
    cats = InventoryCategory.query.order_by(InventoryCategory.sort_order).all()
    return jsonify([{'id': c.id, 'name': c.name} for c in cats])


@app.route('/api/inventory/categories', methods=['POST'])
def create_category():
    data = request.json
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name required'}), 400
    max_order = db.session.query(db.func.max(InventoryCategory.sort_order)).scalar() or 0
    cat = InventoryCategory(name=name, sort_order=max_order + 1)
    db.session.add(cat)
    db.session.commit()
    return jsonify({'ok': True, 'id': cat.id})


@app.route('/api/inventory/categories/<int:cat_id>', methods=['PUT'])
def update_category(cat_id):
    data = request.json
    cat = InventoryCategory.query.get_or_404(cat_id)
    if 'name' in data:
        cat.name = data['name'].strip()
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/inventory/categories/<int:cat_id>', methods=['DELETE'])
def delete_category(cat_id):
    cat = InventoryCategory.query.get_or_404(cat_id)
    items = InventoryItem.query.filter_by(category_id=cat_id).all()
    for item in items:
        InventoryTransaction.query.filter_by(item_id=item.id).delete()
        db.session.delete(item)
    db.session.delete(cat)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    """
    Simple admin authentication endpoint.
    Expects JSON: { "password": "<password>" }.
    The expected password must be set in the ADMIN_PASSWORD environment variable.
    Special shortcuts:
      - '0000' : legacy admin access (admin dashboard /manage)
      - '9999' : shortages/inventory quick access (/manage/shortages)
    """
    data = request.json or {}
    password = data.get('password', '')
    expected = os.environ.get('ADMIN_PASSWORD')

    # shortages shortcut -> limited access to shortages page
    if password == '9999':
        return jsonify({'ok': True, 'role': 'shortages'})

    # legacy local admin shortcut -> full admin
    if password == '0000':
        return jsonify({'ok': True, 'role': 'admin'})

    # production admin password
    if not expected:
        return jsonify({'error': 'Admin password not configured'}), 500
    if password == expected:
        return jsonify({'ok': True, 'role': 'admin'})

    return jsonify({'error': 'Invalid password'}), 401

# ─── Shortages Page & API ─────────────────────────────────
@app.route('/manage/shortages')
def manage_shortages():
    return render_template('shortages.html')

@app.route('/api/shortages')
def get_shortages():
    target_date = request.args.get('date', date.today().isoformat())
    target_date = date.fromisoformat(target_date)
    items = ShortageItem.query.order_by(ShortageItem.sort_order).all()
    result = []
    for item in items:
        count = ShortageCount.query.filter_by(item_id=item.id, date=target_date).first()
        result.append({
            'id': item.id,
            'name': item.name,
            'category': item.category,
            'has_box': bool(item.has_box),
            'units': count.units if count else 0,
            'boxes': count.boxes if (count and count.boxes is not None) else (0 if item.has_box else None),
        })
    return jsonify(result)

@app.route('/api/shortages', methods=['POST'])
def update_shortage():
    data = request.json or {}
    item_id = data.get('item_id')
    if item_id is None:
        return jsonify({'error': 'item_id required'}), 400
    target_date = date.fromisoformat(data.get('date', date.today().isoformat()))
    try:
        units = int(data.get('units', 0))
    except:
        units = 0
    boxes = data.get('boxes')
    try:
        boxes = int(boxes) if boxes is not None and boxes != '' else None
    except:
        boxes = None
    staff = data.get('updated_by', '')
    sc = ShortageCount.query.filter_by(item_id=item_id, date=target_date).first()
    if sc:
        sc.units = units
        sc.boxes = boxes
        sc.updated_by = staff
        sc.updated_at = datetime.now()
    else:
        sc = ShortageCount(
            item_id=item_id, date=target_date, units=units, boxes=boxes,
            updated_by=staff, updated_at=datetime.now()
        )
        db.session.add(sc)
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/shortages', methods=['DELETE'])
def delete_shortages():
    target_date = date.fromisoformat(request.args.get('date', date.today().isoformat()))
    data = request.json or {}
    password = data.get('password', '')
    expected = os.environ.get('ADMIN_PASSWORD')
    if password != '9999' and (not expected or password != expected):
        return jsonify({'error': 'Invalid admin password'}), 401
    ShortageCount.query.filter_by(date=target_date).delete()
    db.session.commit()
    return jsonify({'ok': True})

@app.route('/api/shortages/history')
def shortages_history():
    days = int(request.args.get('days', 7))
    end = date.today()
    start = end - timedelta(days=days-1)
    results = []
    current = start
    while current <= end:
        day_counts = ShortageCount.query.filter_by(date=current).all()
        results.append({
            'date': current.isoformat(),
            'counts': [{
                'item_id': c.item_id,
                'units': c.units,
                'boxes': c.boxes,
                'updated_by': c.updated_by,
                'updated_at': c.updated_at.strftime('%Y-%m-%d %H:%M') if c.updated_at else None
            } for c in day_counts]
        })
        current += timedelta(days=1)
    return jsonify(results)

# ─── Init DB ─────────────────────────────────────────────

def init_db():
    from seed_data import DAYTIME_CHECKLIST, NIGHTTIME_CHECKLIST, INVENTORY_DATA, SHORTAGE_ITEMS

    db.create_all()

    if ChecklistItem.query.first():
        # DB already seeded — ensure shortage master exists
        if not ShortageItem.query.first():
            order = 0
            for cat, names in SHORTAGE_ITEMS.items():
                for nm in names:
                    db.session.add(ShortageItem(name=nm, category=cat, has_box=(cat == 'drink'), sort_order=order))
                    order += 1
            db.session.commit()
            print("Shortage master list seeded.")
        return

    for i, name in enumerate(['윤진한', '김가영', '안재현', '박성규', '제은서', '최지훈']):
        db.session.add(Staff(name=name, sort_order=i))

    for i, name in enumerate(DAYTIME_CHECKLIST):
        db.session.add(ChecklistItem(name=name, shift='day', sort_order=i))
    for i, name in enumerate(NIGHTTIME_CHECKLIST):
        db.session.add(ChecklistItem(name=name, shift='night', sort_order=i))

    for order, (cat_name, items) in enumerate(INVENTORY_DATA.items()):
        cat = InventoryCategory(name=cat_name, sort_order=order)
        db.session.add(cat)
        db.session.flush()

        for idx, item_data in enumerate(items):
            if isinstance(item_data, tuple):
                name, location = item_data
            else:
                name = item_data
                location = None
            db.session.add(InventoryItem(
                category_id=cat.id, name=name, location=location,
                sort_order=idx, quantity=0,
            ))

    # seed shortages master list
    order = 0
    for cat, names in SHORTAGE_ITEMS.items():
        for nm in names:
            db.session.add(ShortageItem(name=nm, category=cat, has_box=(cat == 'drink'), sort_order=order))
            order += 1

    db.session.commit()
    print("Database initialized with seed data.")


with app.app_context():
    init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
