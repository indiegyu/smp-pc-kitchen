from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date

db = SQLAlchemy()


class Staff(db.Model):
    __tablename__ = 'staff'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)


class ChecklistItem(db.Model):
    __tablename__ = 'checklist_items'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    shift = db.Column(db.String(10), nullable=False)  # 'day' or 'night'
    sort_order = db.Column(db.Integer, default=0)
    active = db.Column(db.Boolean, default=True)

    logs = db.relationship('ChecklistLog', backref='item', lazy='dynamic')


class ChecklistLog(db.Model):
    __tablename__ = 'checklist_logs'
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey('checklist_items.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    completed = db.Column(db.Boolean, default=False)
    completed_by = db.Column(db.String(50))
    completed_at = db.Column(db.DateTime)

    __table_args__ = (
        db.UniqueConstraint('item_id', 'date', name='uq_item_date'),
    )


class DailyNote(db.Model):
    """Handoff notes and purchase list per date/shift."""
    __tablename__ = 'daily_notes'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    shift = db.Column(db.String(10), nullable=False)
    type = db.Column(db.String(20), nullable=False)  # 'handoff' or 'purchase'
    content = db.Column(db.Text, default='')
    updated_by = db.Column(db.String(50))
    updated_at = db.Column(db.DateTime)

    __table_args__ = (
        db.UniqueConstraint('date', 'shift', 'type', name='uq_note_date_shift_type'),
    )

class Message(db.Model):
    """Messages sent from admin to staff for a given date/shift."""
    __tablename__ = 'messages'
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey('staff.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    shift = db.Column(db.String(10), nullable=False)  # 'day' or 'night'
    content = db.Column(db.Text, nullable=False)
    read_flag = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)

    sender = db.relationship('Staff', foreign_keys=[sender_id], backref='sent_messages')
    recipient = db.relationship('Staff', foreign_keys=[recipient_id], backref='received_messages')


class InventoryCategory(db.Model):
    __tablename__ = 'inventory_categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    sort_order = db.Column(db.Integer, default=0)

    items = db.relationship('InventoryItem', backref='category', lazy='dynamic',
                            order_by='InventoryItem.sort_order')


class InventoryItem(db.Model):
    __tablename__ = 'inventory_items'
    id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey('inventory_categories.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Integer, default=0)
    min_threshold = db.Column(db.Integer, default=2)
    location = db.Column(db.String(100))
    sort_order = db.Column(db.Integer, default=0)
    updated_at = db.Column(db.DateTime)
    updated_by = db.Column(db.String(50))

    transactions = db.relationship('InventoryTransaction', backref='item', lazy='dynamic',
                                   order_by='InventoryTransaction.created_at.desc()')


class InventoryTransaction(db.Model):
    __tablename__ = 'inventory_transactions'
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey('inventory_items.id'), nullable=False)
    type = db.Column(db.String(10), nullable=False)  # 'in' or 'out'
    quantity = db.Column(db.Integer, nullable=False)
    note = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.now)
    created_by = db.Column(db.String(50))

class ShortageItem(db.Model):
    __tablename__ = 'shortage_items'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(20), nullable=False)  # 'drink', 'snack', 'ramen'
    has_box = db.Column(db.Boolean, default=False)
    sort_order = db.Column(db.Integer, default=0)

    counts = db.relationship('ShortageCount', backref='item', lazy='dynamic')

class ShortageCount(db.Model):
    __tablename__ = 'shortage_counts'
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey('shortage_items.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    units = db.Column(db.Integer, default=0)
    boxes = db.Column(db.Integer)
    updated_by = db.Column(db.String(50))
    updated_at = db.Column(db.DateTime, default=datetime.now)

    __table_args__ = (
        db.UniqueConstraint('item_id', 'date', name='uq_shortage_item_date'),
    )
