PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monthly_expense_months (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  income_cents INTEGER NOT NULL DEFAULT 0 CHECK (income_cents >= 0),
  variable_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK (variable_limit_cents >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, year, month),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_months_user_period
  ON monthly_expense_months (user_id, year DESC, month DESC);

CREATE TABLE IF NOT EXISTS monthly_expense_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#9333ea',
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_categories_user
  ON monthly_expense_categories (user_id, archived_at, name);

CREATE TABLE IF NOT EXISTS monthly_expense_payment_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2563eb',
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_payment_methods_user
  ON monthly_expense_payment_methods (user_id, archived_at, name);

CREATE TABLE IF NOT EXISTS monthly_expense_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  payment_method_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  total_purchase_cents INTEGER NOT NULL CHECK (total_purchase_cents > 0),
  installment_number INTEGER NOT NULL DEFAULT 1 CHECK (installment_number > 0),
  installment_total INTEGER NOT NULL DEFAULT 1 CHECK (installment_total > 0),
  expense_type TEXT NOT NULL CHECK (expense_type IN ('FIXO', 'VARIAVEL', 'RESERVA')),
  installment_group_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (month_id) REFERENCES monthly_expense_months(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES monthly_expense_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (payment_method_id) REFERENCES monthly_expense_payment_methods(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_items_month
  ON monthly_expense_items (month_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_items_group
  ON monthly_expense_items (installment_group_id, installment_number);
