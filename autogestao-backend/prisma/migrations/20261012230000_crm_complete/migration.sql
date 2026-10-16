ALTER TABLE customers ADD COLUMN created_by_id TEXT;
ALTER TABLE customers ADD CONSTRAINT customers_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE leads ADD COLUMN tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN lost_reason TEXT, ADD COLUMN closed_at TIMESTAMP(3),
 ADD COLUMN last_contact_at TIMESTAMP(3), ADD COLUMN archived_at TIMESTAMP(3), ADD COLUMN sale_id TEXT;
CREATE UNIQUE INDEX leads_sale_id_key ON leads(sale_id);
ALTER TABLE leads ADD CONSTRAINT leads_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX leads_dealership_id_assigned_seller_id_archived_at_idx ON leads(dealership_id, assigned_seller_id, archived_at);
CREATE TABLE crm_activities (
 id TEXT PRIMARY KEY, dealership_id TEXT NOT NULL, lead_id TEXT NOT NULL, user_id TEXT,
 kind TEXT NOT NULL, content TEXT NOT NULL, metadata JSONB,
 occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (dealership_id) REFERENCES dealerships(id) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX crm_activities_dealership_id_lead_id_occurred_at_idx ON crm_activities(dealership_id, lead_id, occurred_at);
CREATE TABLE crm_tasks (
 id TEXT PRIMARY KEY, dealership_id TEXT NOT NULL, lead_id TEXT NOT NULL, assigned_user_id TEXT, created_by_id TEXT,
 title TEXT NOT NULL, notes TEXT, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open', auto_followup BOOLEAN NOT NULL DEFAULT false,
 due_at TIMESTAMP(3) NOT NULL, remind_at TIMESTAMP(3), completed_at TIMESTAMP(3),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL,
 FOREIGN KEY (dealership_id) REFERENCES dealerships(id) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
 FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX crm_tasks_dealership_id_assigned_user_id_status_due_at_idx ON crm_tasks(dealership_id, assigned_user_id, status, due_at);
CREATE INDEX crm_tasks_lead_id_idx ON crm_tasks(lead_id);
