/* ============================================================
   EgyGulf ERP — Supabase Adapter
   يحل محل api-adapter.js بالكامل
   بيتكلم مع Supabase مباشرة بدون Express server
   ============================================================ */

const SUPABASE_URL  = 'https://quttnlxcppzunzxsqadz.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1dHRubHhjcHB6dW56eHNxYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODA4MDYsImV4cCI6MjA5NjY1NjgwNn0.JjIXBYfcVtg3MLsqFHxwMxiVE8G554unYa56v5bxzow';

// ── Supabase REST helper ──────────────────────────────────────
const sb = {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  },

  async get(table, query = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async post(table, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async patch(table, id, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async patchByKey(key, value) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?key=eq.${key}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async delete(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  },

  async deleteWhere(table, col, val) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}`, {
      method: 'DELETE',
      headers: this.headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  },
};

// ── ID generator ─────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Date range helper ─────────────────────────────────────────
function dateRange(period, from, to) {
  const now = new Date();
  let start, end;
  if (period === 'custom' && from && to) {
    start = from;
    end   = to;
  } else if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    start = d.toISOString().slice(0, 10);
    end   = now.toISOString().slice(0, 10);
  } else if (period === 'day') {
    start = end = now.toISOString().slice(0, 10);
  } else {
    // month (default)
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  }
  return { start, end };
}

// ════════════════════════════════════════════════════════════
// ACTION HANDLERS  — كل action بياخد payload ويرجع { success, data }
// ════════════════════════════════════════════════════════════
const actions = {

  // ── PRODUCTS ────────────────────────────────────────────
  async getProducts() {
    const rows = await sb.get('products', '?order=created_at.asc&status=neq.Deleted');
    return { success: true, data: rows.map(mapProduct) };
  },

  async addProduct({ data: d }) {
    const id = genId();
    await sb.post('products', {
      id,
      product_name:      d.ProductName,
      category:          d.Category        || '',
      size:              d.Size            || '',
      units_per_carton:  d.UnitsPerCarton  || 0,
      carton_weight:     d.CartonWeight    || 0,
      carton_dimensions: d.CartonDimensions|| '',
      price_per_carton:  d.PricePerCarton  || 0,
      sku:               d.SKU             || '',
      status:            d.Status          || 'Active',
    });
    return { success: true };
  },

  async updateProduct({ id, data: d }) {
    await sb.patch('products', id, {
      product_name:      d.ProductName,
      category:          d.Category        || '',
      size:              d.Size            || '',
      units_per_carton:  d.UnitsPerCarton  || 0,
      carton_weight:     d.CartonWeight    || 0,
      carton_dimensions: d.CartonDimensions|| '',
      price_per_carton:  d.PricePerCarton  || 0,
      sku:               d.SKU             || '',
      status:            d.Status          || 'Active',
      updated_at:        new Date().toISOString(),
    });
    return { success: true };
  },

  async deleteProduct({ id }) {
    await sb.delete('products', id);
    return { success: true };
  },

  // ── FLAVORS ─────────────────────────────────────────────
  async getFlavors() {
    const rows = await sb.get('flavors', '?order=created_at.asc');
    return { success: true, data: rows.map(mapFlavor) };
  },

  async addFlavor({ data: d }) {
    const id = genId();
    await sb.post('flavors', {
      id,
      product_id:      d.ProductID    || null,
      product_name:    d.ProductName  || '',
      flavor_name:     d.FlavorName   || '',
      flavor_name_ar:  d.FlavorNameAr || '',
    });
    return { success: true };
  },

  async deleteFlavor({ id }) {
    await sb.delete('flavors', id);
    return { success: true };
  },

  // ── CUSTOMERS ───────────────────────────────────────────
  async getCustomers() {
    const rows = await sb.get('customers', '?order=created_at.asc');
    return { success: true, data: rows.map(mapCustomer) };
  },

  async addCustomer({ data: d }) {
    const id = genId();
    await sb.post('customers', {
      id,
      company_name:   d.CompanyName    || '',
      contact_person: d.ContactPerson  || '',
      email:          d.Email          || '',
      phone:          d.Phone          || '',
      country:        d.Country        || '',
      city:           d.City           || '',
      address:        d.Address        || '',
      tax_number:     d.TaxNumber      || '',
      notes:          d.Notes          || '',
    });
    return { success: true };
  },

  async updateCustomer({ id, data: d }) {
    await sb.patch('customers', id, {
      company_name:   d.CompanyName    || '',
      contact_person: d.ContactPerson  || '',
      email:          d.Email          || '',
      phone:          d.Phone          || '',
      country:        d.Country        || '',
      city:           d.City           || '',
      address:        d.Address        || '',
      tax_number:     d.TaxNumber      || '',
      notes:          d.Notes          || '',
      updated_at:     new Date().toISOString(),
    });
    return { success: true };
  },

  async deleteCustomer({ id }) {
    await sb.delete('customers', id);
    return { success: true };
  },

  // ── SALES TEAM ──────────────────────────────────────────
  async getSalesTeam() {
    const rows = await sb.get('sales_team', '?order=created_at.asc');
    return { success: true, data: rows.map(mapSalesMember) };
  },

  async addSalesMember({ data: d }) {
    const id = genId();
    await sb.post('sales_team', {
      id,
      employee_name:      d.EmployeeName      || '',
      email:              d.Email             || '',
      phone:              d.Phone             || '',
      commission_percent: d.CommissionPercent || 0,
    });
    return { success: true };
  },

  async updateSalesMember({ id, data: d }) {
    await sb.patch('sales_team', id, {
      employee_name:      d.EmployeeName      || '',
      email:              d.Email             || '',
      phone:              d.Phone             || '',
      commission_percent: d.CommissionPercent || 0,
      updated_at:         new Date().toISOString(),
    });
    return { success: true };
  },

  async deleteSalesMember({ id }) {
    await sb.delete('sales_team', id);
    return { success: true };
  },

  // ── SOCIAL TEAM ─────────────────────────────────────────
  async getSocialTeam() {
    const rows = await sb.get('social_team', '?order=created_at.asc');
    return { success: true, data: rows.map(mapSocialMember) };
  },

  async addSocialMember({ data: d }) {
    const id = genId();
    await sb.post('social_team', {
      id,
      employee_name:      d.EmployeeName      || '',
      email:              d.Email             || '',
      phone:              d.Phone             || '',
      commission_percent: d.CommissionPercent || 0,
    });
    return { success: true };
  },

  async updateSocialMember({ id, data: d }) {
    await sb.patch('social_team', id, {
      employee_name:      d.EmployeeName      || '',
      email:              d.Email             || '',
      phone:              d.Phone             || '',
      commission_percent: d.CommissionPercent || 0,
      updated_at:         new Date().toISOString(),
    });
    return { success: true };
  },

  async deleteSocialMember({ id }) {
    await sb.delete('social_team', id);
    return { success: true };
  },

  // ── INVOICES ────────────────────────────────────────────
  async getInvoices() {
    const rows = await sb.get('invoices', '?order=created_at.desc');
    return { success: true, data: rows.map(mapInvoice) };
  },

  async getInvoiceItems({ id }) {
    const rows = await sb.get('invoice_items', `?invoice_id=eq.${id}&order=created_at.asc`);
    const allFlavors = await sb.get('flavors', '');
    const flavorMap = {};
    allFlavors.forEach(f => { flavorMap[f.id] = f; });

    return {
      success: true,
      data: rows.map(row => {
        const mapped = mapInvoiceItem(row);
        let flavorIds = [];
        try {
          const parsed = JSON.parse(row.flavors || '[]');
          flavorIds = Array.isArray(parsed) ? parsed : [];
        } catch {
          flavorIds = (row.flavors || '').split(/[,•\s]+/).map(s => s.trim()).filter(Boolean);
        }
        const resolvedFlavors = flavorIds.map(fid => {
          const f = flavorMap[fid];
          return f ? { id: f.id, en: f.flavor_name, ar: f.flavor_name_ar || '' } : null;
        }).filter(Boolean);
        // لو عندنا أسماء، احفظهم بدل IDs عشان الطباعة تشتغل
        mapped.Flavors = resolvedFlavors.length
          ? JSON.stringify(resolvedFlavors)
          : JSON.stringify(flavorIds);
        return mapped;
      }),
    };
  },

  async saveInvoice({ data: d }) {
    const id = genId();
    // احسب رقم الفاتورة
    const settRow = await sb.get('settings', `?key=eq.NextInvoiceNumber`);
    const nextNum = parseInt((settRow[0] || {}).value || '1001');
    const prefix  = ((await sb.get('settings', `?key=eq.InvoicePrefix`))[0] || {}).value || 'INV';
    const invNum  = `${prefix}-${String(nextNum).padStart(4, '0')}`;

    await sb.post('invoices', {
      id,
      invoice_number:         invNum,
      invoice_date:           d.InvoiceDate,
      customer_id:            d.CustomerID            || null,
      customer_name:          d.CustomerName          || '',
      sales_rep_id:           d.SalesRepID            || null,
      sales_rep_name:         d.SalesRepName          || '',
      social_rep_id:          d.SocialRepID           || null,
      social_rep_name:        d.SocialRepName         || '',
      subtotal:               d.Subtotal              || 0,
      discount_raw:           d.DiscountRaw           || '',
      discount_percent:       d.DiscountPercent       || 0,
      discount_value:         d.DiscountValue         || 0,
      total_after_discount:   d.TotalAfterDiscount    || 0,
      sales_commission_rate:  d.SalesCommissionRate   || 0,
      sales_commission:       d.SalesCommission       || 0,
      social_commission_rate: d.SocialCommissionRate  || 0,
      social_commission:      d.SocialCommission      || 0,
      grand_total:            d.GrandTotal            || 0,
      notes:                  d.Notes                 || '',
      status:                 d.Status                || 'Draft',
      run_number:             d.RunNumber             || '',
      production_month:       d.ProductionMonth       || '',
      expiry:                 d.Expiry                || '',
      production_notes:       d.ProductionNotes       || '',
      purchasing_notes:       d.PurchasingNotes       || '',
      manufacturing_notes:    d.ManufacturingNotes    || '',
      port_of_loading:          d.PortOfLoading           || '',
      port_of_discharge:        d.PortOfDischarge         || '',
      health_cert:              d.HealthCert              || 'لم يتم',
      production_order_date:    d.ProductionOrderDate     || null,
    });

    // حفظ البنود
    if (d.Items && d.Items.length) {
      for (const it of d.Items) {
        await sb.post('invoice_items', {
          id:               genId(),
          invoice_id:       id,
          product_id:       it.ProductID    || null,
          product_name:     it.ProductName  || '',
          quantity:         it.Quantity     || 0,
          unit_price:       it.UnitPrice    || 0,
          carton_qty:       it.CartonQty    || 0,
          line_total:       it.LineTotal    || 0,
          flavors:          Array.isArray(it.Flavors) ? JSON.stringify(it.Flavors) : (it.Flavors || '[]'),
          pack_size:        it.PackSize     || '',
          units_per_carton: it.UnitsPerCarton || '',
        });
      }
    }

    // حفظ العمولات
    if (d.SalesRepID && d.SalesCommission > 0) {
      await sb.post('commissions', {
        id:                genId(),
        invoice_id:        id,
        invoice_number:    invNum,
        invoice_date:      d.InvoiceDate,
        type:              'Sales',
        rep_id:            d.SalesRepID,
        rep_name:          d.SalesRepName,
        commission_rate:   d.SalesCommissionRate,
        commission_amount: d.SalesCommission,
      });
    }
    if (d.SocialRepID && d.SocialCommission > 0) {
      await sb.post('commissions', {
        id:                genId(),
        invoice_id:        id,
        invoice_number:    invNum,
        invoice_date:      d.InvoiceDate,
        type:              'Social',
        rep_id:            d.SocialRepID,
        rep_name:          d.SocialRepName,
        commission_rate:   d.SocialCommissionRate,
        commission_amount: d.SocialCommission,
      });
    }

    // تحديث رقم الفاتورة القادم
    await sb.patchByKey('NextInvoiceNumber', String(nextNum + 1));

    return { success: true };
  },

  async updateInvoice({ id, data: d }) {
    await sb.patch('invoices', id, {
      invoice_date:           d.InvoiceDate,
      customer_id:            d.CustomerID            || null,
      customer_name:          d.CustomerName          || '',
      sales_rep_id:           d.SalesRepID            || null,
      sales_rep_name:         d.SalesRepName          || '',
      social_rep_id:          d.SocialRepID           || null,
      social_rep_name:        d.SocialRepName         || '',
      subtotal:               d.Subtotal              || 0,
      discount_raw:           d.DiscountRaw           || '',
      discount_percent:       d.DiscountPercent       || 0,
      discount_value:         d.DiscountValue         || 0,
      total_after_discount:   d.TotalAfterDiscount    || 0,
      sales_commission_rate:  d.SalesCommissionRate   || 0,
      sales_commission:       d.SalesCommission       || 0,
      social_commission_rate: d.SocialCommissionRate  || 0,
      social_commission:      d.SocialCommission      || 0,
      grand_total:            d.GrandTotal            || 0,
      notes:                  d.Notes                 || '',
      status:                 d.Status                || 'Draft',
      run_number:             d.RunNumber             || '',
      production_month:       d.ProductionMonth       || '',
      expiry:                 d.Expiry                || '',
      production_notes:       d.ProductionNotes       || '',
      purchasing_notes:       d.PurchasingNotes       || '',
      manufacturing_notes:    d.ManufacturingNotes    || '',
      port_of_loading:        d.PortOfLoading         || '',
      port_of_discharge:      d.PortOfDischarge       || '',
      production_order_date:  d.ProductionOrderDate   || null,
      updated_at:             new Date().toISOString(),
    });

    // حذف البنود القديمة وإعادة الحفظ
    await sb.deleteWhere('invoice_items', 'invoice_id', id);
    if (d.Items && d.Items.length) {
      for (const it of d.Items) {
        await sb.post('invoice_items', {
          id:               genId(),
          invoice_id:       id,
          product_id:       it.ProductID    || null,
          product_name:     it.ProductName  || '',
          quantity:         it.Quantity     || 0,
          unit_price:       it.UnitPrice    || 0,
          carton_qty:       it.CartonQty    || 0,
          line_total:       it.LineTotal    || 0,
          flavors:          Array.isArray(it.Flavors) ? JSON.stringify(it.Flavors) : (it.Flavors || '[]'),
          pack_size:        it.PackSize     || '',
          units_per_carton: it.UnitsPerCarton || '',
        });
      }
    }

    // تحديث العمولات
    await sb.deleteWhere('commissions', 'invoice_id', id);
    const invRow = (await sb.get('invoices', `?id=eq.${id}`))[0] || {};
    if (d.SalesRepID && d.SalesCommission > 0) {
      await sb.post('commissions', {
        id:                genId(),
        invoice_id:        id,
        invoice_number:    invRow.invoice_number || '',
        invoice_date:      d.InvoiceDate,
        type:              'Sales',
        rep_id:            d.SalesRepID,
        rep_name:          d.SalesRepName,
        commission_rate:   d.SalesCommissionRate,
        commission_amount: d.SalesCommission,
      });
    }
    if (d.SocialRepID && d.SocialCommission > 0) {
      await sb.post('commissions', {
        id:                genId(),
        invoice_id:        id,
        invoice_number:    invRow.invoice_number || '',
        invoice_date:      d.InvoiceDate,
        type:              'Social',
        rep_id:            d.SocialRepID,
        rep_name:          d.SocialRepName,
        commission_rate:   d.SocialCommissionRate,
        commission_amount: d.SocialCommission,
      });
    }

    return { success: true };
  },

  async updateInvoiceStatus({ id, data: d }) {
    const patchData = { updated_at: new Date().toISOString() };
    if (d.Status       !== undefined) patchData.status        = d.Status;
    if (d.HealthCert   !== undefined) patchData.health_cert   = d.HealthCert;
    if (d.ShippingDate !== undefined) patchData.shipping_date = d.ShippingDate || null;
    await sb.patch('invoices', id, patchData);
    return { success: true };
  },

  async deleteInvoice({ id }) {
    await sb.deleteWhere('invoice_items', 'invoice_id', id);
    await sb.deleteWhere('commissions',   'invoice_id', id);
    await sb.delete('invoices', id);
    return { success: true };
  },

  // ── COMMISSIONS ─────────────────────────────────────────
  async getCommissions() {
    const rows = await sb.get('commissions', '?order=created_at.desc');
    return { success: true, data: rows.map(mapCommission) };
  },

  // ── TODO ────────────────────────────────────────────────
  async getTodos() {
    const rows = await sb.get('todo_items', '?order=created_at.asc');
    return { success: true, data: rows.map(mapTodo) };
  },

  async addTodo({ data: d }) {
    await sb.post('todo_items', {
      id:        genId(),
      task_text: d.TaskText || '',
      done:      false,
    });
    return { success: true };
  },

  async updateTodoDone({ id, data: d }) {
    await sb.patch('todo_items', id, {
      done:       d.Done === 'TRUE' || d.Done === true,
      updated_at: new Date().toISOString(),
    });
    return { success: true };
  },

  async deleteTodo({ id }) {
    await sb.delete('todo_items', id);
    return { success: true };
  },

  async clearDoneTodos({ data: d }) {
    if (d.ids && d.ids.length) {
      for (const id of d.ids) await sb.delete('todo_items', id);
    }
    return { success: true };
  },

  // ── SETTINGS ────────────────────────────────────────────
  async getSettings() {
    const rows = await sb.get('settings', '');
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    return { success: true, data: obj };
  },

  async saveSettings({ data: d }) {
    const map = {
      CompanyName:    d.CompanyName    || '',
      CompanyNameAr:  d.CompanyNameAr  || '',
      CompanyEmail:   d.CompanyEmail   || '',
      CompanyPhone:   d.CompanyPhone   || '',
      CompanyWebsite: d.CompanyWebsite || '',
      CompanyAddress: d.CompanyAddress || '',
      PortLoading:    d.PortLoading    || '',
      Currency:       d.Currency       || 'USD',
    };
    for (const [key, value] of Object.entries(map)) {
      const existing = await sb.get('settings', `?key=eq.${key}`);
      if (existing.length) {
        await fetch(`${SUPABASE_URL}/rest/v1/settings?key=eq.${key}`, {
          method: 'PATCH',
          headers: sb.headers,
          body: JSON.stringify({ value }),
        });
      } else {
        await sb.post('settings', { key, value });
      }
    }
    return { success: true };
  },

  // ── DASHBOARD ───────────────────────────────────────────
  async getDashboard() {
    const [customers, products, invoices] = await Promise.all([
      sb.get('customers', '?select=id'),
      sb.get('products',  '?select=id&status=eq.Active'),
      sb.get('invoices',  '?select=id,customer_name,grand_total,status,invoice_number,invoice_date,sales_commission,social_commission&order=created_at.desc'),
    ]);

    const paid = invoices.filter(i => i.status === 'Paid' || i.status === 'Confirmed');
    const totalRevenue         = paid.reduce((s, i) => s + (+i.grand_total || 0), 0);
    const totalSalesCommission = paid.reduce((s, i) => s + (+i.sales_commission || 0), 0);
    const totalSocialCommission= paid.reduce((s, i) => s + (+i.social_commission || 0), 0);

    // أفضل عميل
    const byCustomer = {};
    paid.forEach(i => {
      byCustomer[i.customer_name] = (byCustomer[i.customer_name] || 0) + (+i.grand_total || 0);
    });
    const topCust = Object.entries(byCustomer).sort((a, b) => b[1] - a[1])[0];

    // أفضل منتج
    const allItems = await sb.get('invoice_items', '?select=product_name,line_total');
    const byProduct = {};
    allItems.forEach(it => {
      byProduct[it.product_name] = (byProduct[it.product_name] || 0) + (+it.line_total || 0);
    });
    const topProd = Object.entries(byProduct).sort((a, b) => b[1] - a[1])[0];

    return {
      success: true,
      data: {
        totalCustomers:        customers.length,
        totalProducts:         products.length,
        totalInvoices:         invoices.length,
        totalRevenue,
        totalSalesCommission,
        totalSocialCommission,
        topCustomer: topCust ? { name: topCust[0], revenue: topCust[1] } : null,
        topProduct:  topProd ? { name: topProd[0], revenue: topProd[1] } : null,
        recentInvoices: invoices.slice(0, 5).map(mapInvoice),
      },
    };
  },

  // ── ANALYTICS ───────────────────────────────────────────
  async getAnalytics() {
    const [items, customers, invoices, allFlavors] = await Promise.all([
      sb.get('invoice_items', '?select=product_name,line_total,flavors,quantity,carton_qty'),
      sb.get('customers',     '?select=id,company_name,country'),
      sb.get('invoices',      '?select=id,customer_id,customer_name,grand_total,status'),
      sb.get('flavors',       '?select=id,flavor_name'),
    ]);

    // خريطة ID النكهة → الاسم
    const flavorNameMap = {};
    allFlavors.forEach(f => { flavorNameMap[f.id] = f.flavor_name; });

    // مساعد تحليل مصفوفة النكهات المحفوظة كـ JSON
    function parseFlavIds(raw) {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(item =>
          (typeof item === 'object' && item !== null)
            ? (flavorNameMap[item.id] || item.en || item.id || '')
            : (flavorNameMap[item] || item || '')
        ).filter(Boolean);
      } catch {
        return raw.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // أفضل منتجات
    const prodMap = {};
    items.forEach(it => {
      const name = it.product_name || '';
      if (!name) return;
      if (!prodMap[name]) prodMap[name] = { revenue: 0, cartons: 0 };
      prodMap[name].revenue += +it.line_total || 0;
      prodMap[name].cartons += +it.carton_qty || 0;
    });
    const topProducts = Object.entries(prodMap)
      .sort((a, b) => b[1].cartons - a[1].cartons)
      .slice(0, 10)
      .map(([name, v]) => ({ name, revenue: v.revenue, cartons: v.cartons, topFlavors: [] }));

    // أفضل نكهات
    const flavMap = {};
    items.forEach(it => {
      const cartons = +it.carton_qty || 0;
      parseFlavIds(it.flavors).forEach(fname => {
        if (!flavMap[fname]) flavMap[fname] = { count: 0, cartons: 0 };
        flavMap[fname].count++;
        flavMap[fname].cartons += cartons;
      });
    });
    const topFlavors = Object.entries(flavMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, v]) => ({ name, count: v.count, cartons: v.cartons }));

    // أفضل دول
    const custCountry = {};
    customers.forEach(c => { custCountry[c.id] = c.country || 'أخرى'; });
    const countryMap = {};
    invoices.forEach(inv => {
      const country = custCountry[inv.customer_id] || 'أخرى';
      if (!countryMap[country]) countryMap[country] = { revenue: 0, invoiceCount: 0 };
      countryMap[country].revenue     += +inv.grand_total || 0;
      countryMap[country].invoiceCount++;
    });
    const topCountries = Object.entries(countryMap)
      .sort((a, b) => b[1].invoiceCount - a[1].invoiceCount)
      .slice(0, 10)
      .map(([country, v]) => ({
        country, revenue: v.revenue, invoiceCount: v.invoiceCount,
        topProducts: [], topFlavors: [],
      }));

    return { success: true, data: { topProducts, topFlavors, topCountries } };
  },

  // ── REPORTS ─────────────────────────────────────────────
  async getRevenueReport({ period, from, to }) {
    const { start, end } = dateRange(period, from, to);
    const rows = await sb.get('invoices',
      `?invoice_date=gte.${start}&invoice_date=lte.${end}&order=invoice_date.desc`);
    const total = rows.reduce((s, i) => s + (+i.grand_total || 0), 0);
    return { success: true, data: { invoices: rows.map(mapInvoice), total } };
  },

  async getCustomerReport({ period, from, to }) {
    const { start, end } = dateRange(period, from, to);
    const rows = await sb.get('invoices',
      `?invoice_date=gte.${start}&invoice_date=lte.${end}&select=customer_name,grand_total,invoice_date`);
    const map = {};
    rows.forEach(i => {
      if (!map[i.customer_name]) map[i.customer_name] = { invoiceCount: 0, totalRevenue: 0, lastInvoiceDate: '' };
      map[i.customer_name].invoiceCount++;
      map[i.customer_name].totalRevenue += +i.grand_total || 0;
      if (!map[i.customer_name].lastInvoiceDate || i.invoice_date > map[i.customer_name].lastInvoiceDate)
        map[i.customer_name].lastInvoiceDate = i.invoice_date;
    });
    const data = Object.entries(map)
      .map(([customerName, v]) => ({ customerName, ...v }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
    return { success: true, data };
  },

  async getProductReport({ period, from, to }) {
    const { start, end } = dateRange(period, from, to);
    const invIds = (await sb.get('invoices',
      `?invoice_date=gte.${start}&invoice_date=lte.${end}&select=id`)).map(i => i.id);
    if (!invIds.length) return { success: true, data: [] };
    const items = await sb.get('invoice_items',
      `?invoice_id=in.(${invIds.join(',')})&select=product_name,quantity,carton_qty,line_total`);
    const map = {};
    items.forEach(it => {
      if (!map[it.product_name]) map[it.product_name] = { totalQty: 0, totalCartons: 0, totalRevenue: 0 };
      map[it.product_name].totalQty     += +it.quantity   || 0;
      map[it.product_name].totalCartons += +it.carton_qty || 0;
      map[it.product_name].totalRevenue += +it.line_total || 0;
    });
    const data = Object.entries(map)
      .map(([productName, v]) => ({ productName, ...v }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
    return { success: true, data };
  },

  async getSalesReport({ period, from, to }) {
    const { start, end } = dateRange(period, from, to);
    const rows = await sb.get('invoices',
      `?invoice_date=gte.${start}&invoice_date=lte.${end}&sales_rep_name=neq.&select=sales_rep_name,grand_total,sales_commission`);
    const map = {};
    rows.forEach(i => {
      if (!i.sales_rep_name) return;
      if (!map[i.sales_rep_name]) map[i.sales_rep_name] = { invoiceCount: 0, totalRevenue: 0, totalCommission: 0 };
      map[i.sales_rep_name].invoiceCount++;
      map[i.sales_rep_name].totalRevenue    += +i.grand_total      || 0;
      map[i.sales_rep_name].totalCommission += +i.sales_commission || 0;
    });
    const data = Object.entries(map)
      .map(([repName, v]) => ({ repName, ...v }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
    return { success: true, data };
  },

  async getSocialReport({ period, from, to }) {
    const { start, end } = dateRange(period, from, to);
    const rows = await sb.get('invoices',
      `?invoice_date=gte.${start}&invoice_date=lte.${end}&social_rep_name=neq.&select=social_rep_name,social_commission`);
    const map = {};
    rows.forEach(i => {
      if (!i.social_rep_name) return;
      if (!map[i.social_rep_name]) map[i.social_rep_name] = { closedDeals: 0, totalCommission: 0, leadsGenerated: 0 };
      map[i.social_rep_name].closedDeals++;
      map[i.social_rep_name].totalCommission += +i.social_commission || 0;
    });
    const data = Object.entries(map)
      .map(([repName, v]) => ({ repName, ...v }))
      .sort((a, b) => b.totalCommission - a.totalCommission);
    return { success: true, data };
  },

  async getCommissionReport({ period, from, to }) {
    const { start, end } = dateRange(period, from, to);
    const rows = await sb.get('commissions',
      `?invoice_date=gte.${start}&invoice_date=lte.${end}&order=invoice_date.desc`);
    const commissions = rows.map(mapCommission);
    const totalSales  = commissions.filter(c => c.Type === 'Sales') .reduce((s, c) => s + c.CommissionAmount, 0);
    const totalSocial = commissions.filter(c => c.Type === 'Social').reduce((s, c) => s + c.CommissionAmount, 0);
    return { success: true, data: { commissions, totalSales, totalSocial, grandTotal: totalSales + totalSocial } };
  },
};

// ════════════════════════════════════════════════════════════
// MAPPERS  — يحول أسماء أعمدة Supabase لأسماء الـ app القديمة
// ════════════════════════════════════════════════════════════
function mapProduct(r) {
  return {
    ID: r.id, ProductName: r.product_name, Category: r.category,
    Size: r.size, UnitsPerCarton: r.units_per_carton,
    CartonWeight: r.carton_weight, CartonDimensions: r.carton_dimensions,
    PricePerCarton: r.price_per_carton, SKU: r.sku, Status: r.status,
  };
}
function mapFlavor(r) {
  return {
    ID: r.id, ProductID: r.product_id, ProductName: r.product_name,
    FlavorName: r.flavor_name, FlavorNameAr: r.flavor_name_ar,
  };
}
function mapCustomer(r) {
  return {
    ID: r.id, CompanyName: r.company_name, ContactPerson: r.contact_person,
    Email: r.email, Phone: r.phone, Country: r.country, City: r.city,
    Address: r.address, TaxNumber: r.tax_number, Notes: r.notes,
  };
}
function mapSalesMember(r) {
  return {
    ID: r.id, EmployeeName: r.employee_name, Email: r.email,
    Phone: r.phone, CommissionPercent: r.commission_percent,
  };
}
function mapSocialMember(r) {
  return {
    ID: r.id, EmployeeName: r.employee_name, Email: r.email,
    Phone: r.phone, CommissionPercent: r.commission_percent,
    LeadsGenerated: r.leads_generated,
  };
}
function mapInvoice(r) {
  return {
    ID: r.id, InvoiceNumber: r.invoice_number, InvoiceDate: r.invoice_date,
    CustomerID: r.customer_id, CustomerName: r.customer_name,
    SalesRepID: r.sales_rep_id, SalesRepName: r.sales_rep_name,
    SocialRepID: r.social_rep_id, SocialRepName: r.social_rep_name,
    Subtotal: r.subtotal, DiscountRaw: r.discount_raw || '',
    DiscountPercent: r.discount_percent,
    DiscountValue: r.discount_value, TotalAfterDiscount: r.total_after_discount,
    SalesCommissionRate: r.sales_commission_rate, SalesCommission: r.sales_commission,
    SocialCommissionRate: r.social_commission_rate, SocialCommission: r.social_commission,
    GrandTotal: r.grand_total, Notes: r.notes, Status: r.status,
    RunNumber: r.run_number, ProductionMonth: r.production_month, Expiry: r.expiry,
    ProductionNotes: r.production_notes, PurchasingNotes: r.purchasing_notes,
    ManufacturingNotes: r.manufacturing_notes,
    PortOfLoading: r.port_of_loading, PortOfDischarge: r.port_of_discharge,
    HealthCert: r.health_cert || 'لم يتم',
    ProductionOrderDate: r.production_order_date || '',
    ShippingDate: r.shipping_date || '',
  };
}
function mapInvoiceItem(r) {
  return {
    ID: r.id, InvoiceID: r.invoice_id, ProductID: r.product_id,
    ProductName: r.product_name, Quantity: r.quantity, UnitPrice: r.unit_price,
    CartonQty: r.carton_qty, LineTotal: r.line_total, Flavors: r.flavors,
    PackSize: r.pack_size, UnitsPerCarton: r.units_per_carton,
  };
}
function mapCommission(r) {
  return {
    ID: r.id, InvoiceID: r.invoice_id, InvoiceNumber: r.invoice_number,
    InvoiceDate: r.invoice_date, Type: r.type, RepID: r.rep_id,
    RepName: r.rep_name, CommissionRate: r.commission_rate,
    CommissionAmount: r.commission_amount,
  };
}
function mapTodo(r) {
  return {
    ID: r.id, TaskText: r.task_text,
    Done: r.done === true || r.done === 'TRUE' ? 'TRUE' : 'FALSE',
  };
}

// ════════════════════════════════════════════════════════════
// OVERRIDE apiGet & apiPost  — نفس الـ interface القديم
// ════════════════════════════════════════════════════════════
window.apiGet = async function apiGet(action, params = {}) {
  const handler = actions[action];
  if (!handler) throw new Error(`Unknown action: ${action}`);
  return handler(params);
};

window.apiPost = async function apiPost(action, payload = {}) {
  const handler = actions[action];
  if (!handler) throw new Error(`Unknown action: ${action}`);
  return handler(payload);
};

// ── checkApiUrl — دايماً جاهز (مفيش URL مطلوب) ──────────────
window.checkApiUrl = function checkApiUrl() {
  const banner = document.getElementById('apiBanner');
  if (banner) banner.style.display = 'none';
  // تحميل إعدادات الشركة من Supabase
  actions.getSettings().then(res => {
    if (res.data) {
      const d = res.data;
      window.COMPANY = {
        CompanyName:    d.CompanyName    || '',
        CompanyNameAr:  d.CompanyNameAr  || '',
        CompanyEmail:   d.CompanyEmail   || '',
        CompanyPhone:   d.CompanyPhone   || '',
        CompanyWebsite: d.CompanyWebsite || '',
        CompanyAddress: d.CompanyAddress || '',
        PortLoading:    d.PortLoading    || '',
      };
      window.CURRENCY = d.Currency || 'USD';
    }
  }).catch(() => {}).finally(() => preloadAllData());
};

// ── openSettings — بيخفي حقل الـ API URL ────────────────────
window.openSettings = function openSettings() {
  const apiUrlEl = document.getElementById('apiUrl');
  if (apiUrlEl) {
    const wrap = apiUrlEl.closest('.form-group');
    if (wrap) wrap.style.display = 'none';
  }
  document.getElementById('settCompanyName').value   = (window.COMPANY || {}).CompanyName    || '';
  document.getElementById('settCompanyNameAr').value = (window.COMPANY || {}).CompanyNameAr  || '';
  document.getElementById('settEmail').value         = (window.COMPANY || {}).CompanyEmail   || '';
  document.getElementById('settPhone').value         = (window.COMPANY || {}).CompanyPhone   || '';
  const webEl = document.getElementById('settWebsite');
  if (webEl) webEl.value                             = (window.COMPANY || {}).CompanyWebsite || '';
  document.getElementById('settAddress').value       = (window.COMPANY || {}).CompanyAddress || '';
  document.getElementById('settPortLoading').value   = (window.COMPANY || {}).PortLoading    || '';
  document.getElementById('settCurrency').value      = window.CURRENCY || 'USD';
  openModal('settingsModal');
};

// ── saveSettings ─────────────────────────────────────────────
window.saveSettings = async function saveSettings(e) {
  e.preventDefault();
  const newComp = {
    CompanyName:    document.getElementById('settCompanyName').value.trim(),
    CompanyNameAr:  document.getElementById('settCompanyNameAr').value.trim(),
    CompanyEmail:   document.getElementById('settEmail').value.trim(),
    CompanyPhone:   document.getElementById('settPhone').value.trim(),
    CompanyWebsite: (document.getElementById('settWebsite') || {}).value?.trim() || '',
    CompanyAddress: document.getElementById('settAddress').value.trim(),
    PortLoading:    document.getElementById('settPortLoading').value.trim(),
  };
  const newCurr = document.getElementById('settCurrency').value;
  localStorage.setItem('egygulf_company',  JSON.stringify(newComp));
  localStorage.setItem('egygulf_currency', newCurr);
  window.COMPANY  = newComp;
  window.CURRENCY = newCurr;
  invalidateCache('products','customers','salesTeam','socialTeam','invoices','flavors','commissions','todos');
  try {
    await actions.saveSettings({ data: { ...newComp, Currency: newCurr } });
  } catch (_) {}
  closeModal('settingsModal');
  showToast('تم حفظ الإعدادات بنجاح');
  preloadAllData();
};

// ── تأكيد إن الـ adapter شغّال ───────────────────────────────
console.log('%c✅ EgyGulf Supabase Adapter loaded', 'color:#4ade80;font-weight:bold');
