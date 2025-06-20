"""Ajout quota

Revision ID: d4cfb0690228
Revises: 1dcdb6715a00
Create Date: 2025-06-02 20:39:59.152659

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4cfb0690228'
down_revision = '1dcdb6715a00'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('order_quota',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('max_orders_per_hour', sa.Integer(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('order_quota')
    # ### end Alembic commands ###
