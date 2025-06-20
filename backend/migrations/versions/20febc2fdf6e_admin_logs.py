"""Admin logs

Revision ID: 20febc2fdf6e
Revises: af91e815ad1b
Create Date: 2025-06-03 23:32:39.398067

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20febc2fdf6e'
down_revision = 'af91e815ad1b'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('admin_activity',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('admin_id', sa.Integer(), nullable=False),
    sa.Column('timestamp', sa.DateTime(), nullable=False),
    sa.Column('action_type', sa.String(length=50), nullable=False),
    sa.Column('target_type', sa.String(length=50), nullable=False),
    sa.Column('target_id', sa.Integer(), nullable=True),
    sa.Column('details', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['admin_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('admin_activity')
    # ### end Alembic commands ###
