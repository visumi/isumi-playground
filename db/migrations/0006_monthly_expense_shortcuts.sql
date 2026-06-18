PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monthly_expense_ingest_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_last4 TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_ingest_tokens_user_active
  ON monthly_expense_ingest_tokens (user_id, revoked_at, created_at DESC);

CREATE TABLE IF NOT EXISTS monthly_expense_pending_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  transaction_date TEXT NOT NULL,
  merchant_name TEXT,
  raw_source TEXT,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DISMISSED')),
  approved_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (month_id) REFERENCES monthly_expense_months(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_item_id) REFERENCES monthly_expense_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_pending_items_month
  ON monthly_expense_pending_items (user_id, month_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_expense_pending_items_source
  ON monthly_expense_pending_items (user_id, source_id)
  WHERE source_id IS NOT NULL;
