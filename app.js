/* ============================================================
   EgyGulf Foods ERP — Main Application Logic
   ============================================================ */
'use strict';

let API_URL = localStorage.getItem('egygulf_api_url') || '';
let CURRENCY = localStorage.getItem('egygulf_currency') || 'USD';
let COMPANY = JSON.parse(localStorage.getItem('egygulf_company') || '{}');

const state = {
    products: [],
    customers: [],
    salesTeam: [],
    socialTeam: [],
    invoices: [],
    flavors: [],
    todos: [],
    currentTab: 'dashboard',
    reportPeriod: 'month',
    currentReport: 'revenue',
};

// ════════════════════════════════════════
// CACHE LAYER — تحميل مرة واحدة، استخدام فوري
// ════════════════════════════════════════
const cache = {
    products: null,
    customers: null,
    salesTeam: null,
    socialTeam: null,
    invoices: null,
    flavors: null,
    todos: null,
    commissions: null,
    invoiceItems: {},
    // مخزن بالـ invoice ID
};

let _preloadPromise = null;

/** يحمّل كل البيانات الأساسية مرة واحدة في الأول */
async function preloadAllData() {
    if (_preloadPromise)
        return _preloadPromise;
    _preloadPromise = (async()=>{
        if (!API_URL)
            return;
        try {
            const [p,c,st,so,inv,f,com] = await Promise.all([apiGet('getProducts'), apiGet('getCustomers'), apiGet('getSalesTeam'), apiGet('getSocialTeam'), apiGet('getInvoices'), apiGet('getFlavors'), apiGet('getCommissions'), ]);
            cache.products = p.data || [];
            cache.customers = c.data || [];
            cache.salesTeam = st.data || [];
            cache.socialTeam = so.data || [];
            cache.invoices = inv.data || [];
            cache.flavors = f.data || [];
            cache.commissions = com.data || [];
            // نحدّث state أيضاً
            state.products = cache.products;
            state.customers = cache.customers;
            state.salesTeam = cache.salesTeam;
            state.socialTeam = cache.socialTeam;
            state.invoices = cache.invoices;
            state.flavors = cache.flavors;
            // تحديث الـ notification bell بعد تحميل الفواتير مباشرة
            try { updateNotifBell(); } catch (_) {}
        } catch (e) {
            _preloadPromise = null;
            // نسمح بإعادة المحاولة
        }
    }
    )();
    return _preloadPromise;
}

/** يبطل الـ cache لنوع معين (بعد الكتابة) */
function invalidateCache(...keys) {
    keys.forEach(k=>{
        cache[k] = null;
        if (k === 'invoices')
            cache.invoiceItems = {};
    }
    );
    _preloadPromise = null;
}

/** يجلب بيانات من الـ cache أو من الـ API لو مش موجودة */
async function cached(key, action, params={}) {
    if (cache[key] !== null)
        return cache[key];
    const res = await apiGet(action, params);
    cache[key] = res.data || [];
    return cache[key];
}

/** يجلب invoice items من cache */
async function cachedInvoiceItems(id) {
    if (cache.invoiceItems[id])
        return cache.invoiceItems[id];
    const res = await apiGet('getInvoiceItems', {
        id
    });
    cache.invoiceItems[id] = res.data || [];
    return cache.invoiceItems[id];
}

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded', ()=>{
    initTheme();
    setTopbarDate();
    setupNavigation();
    checkApiUrl();
    navigateTo('dashboard');
}
);

// ════════════════════════════════════════
// THEME TOGGLE — دارك / لايت مود
// ════════════════════════════════════════
function initTheme() {
    const saved = localStorage.getItem('egygulf_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('egygulf_theme', next);
}

function setTopbarDate() {
    const d = new Date();
    document.getElementById('topbarDate').textContent = d.toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function checkApiUrl() {
    if (!API_URL) {
        document.getElementById('apiBanner').style.display = 'flex';
        return;
    }
    preloadAllData();
    // نبدأ تحميل كل البيانات في الخلفية فوراً
}

// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════
const TAB_TITLES = {
    dashboard: 'لوحة التحكم',
    products: 'المنتجات',
    customers: 'العملاء',
    sales: 'فريق المبيعات',
    social: 'فريق السوشيال ميديا',
    invoices: 'الفواتير',
    shipping: 'مواعيد التحميل',
    reports: 'التقارير',
    todos: 'مهامي اليومية',
};

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item=>{
        item.addEventListener('click', ()=>{
            navigateTo(item.dataset.tab);
            if (window.innerWidth <= 768)
                document.getElementById('sidebar').classList.remove('open');
        }
        );
    }
    );
}

function navigateTo(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    document.getElementById('topbarTitle').textContent = TAB_TITLES[tab] || '';
    switch (tab) {
    case 'dashboard':
        loadDashboard();
        break;
    case 'products':
        loadProducts();
        loadFlavors();
        break;
    case 'customers':
        loadCustomers();
        break;
    case 'sales':
        loadSalesTeam();
        break;
    case 'social':
        loadSocialTeam();
        break;
    case 'invoices':
        loadInvoices();
        break;
    case 'shipping':
        loadShippingDates();
        break;
    case 'reports':
        loadReports();
        break;
    case 'todos':
        loadTodos();
        break;
    case 'packing':
        plInit();
        break;
    }
}

function toggleSidebar() {
    if (window.innerWidth <= 768)
        document.getElementById('sidebar').classList.toggle('open');
    else
        document.body.classList.toggle('sidebar-collapsed');
}

// ════════════════════════════════════════
// API HELPERS
// ════════════════════════════════════════
async function apiGet(action, params={}) {
    if (!API_URL) {
        showToast('يرجى ضبط رابط الـ API أولاً', 'warning');
        throw new Error('NO_API');
    }
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k,v])=>url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!data.success)
        throw new Error(data.error || 'خطأ في الخادم');
    return data;
}

async function apiPost(action, payload={}) {
    if (!API_URL) {
        showToast('يرجى ضبط رابط الـ API أولاً', 'warning');
        throw new Error('NO_API');
    }
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain'
        },
        body: JSON.stringify({
            action,
            ...payload
        })
    });
    const data = await res.json();
    if (!data.success)
        throw new Error(data.error || 'خطأ في الخادم');
    return data;
}

// ════════════════════════════════════════
// FORMATTING
// ════════════════════════════════════════
function fmt(num) {
    const n = parseFloat(num) || 0;
    return n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' ' + CURRENCY;
}
function fmtNum(num) {
    return (parseFloat(num) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}
function fmtDate(d) {
    if (!d)
        return '—';
    return new Date(d).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
function statusBadge(status) {
    const map = {
        Active: ['badge-active', 'نشط'],
        Inactive: ['badge-inactive', 'غير نشط'],
        Draft: ['badge-draft', 'مسودة'],
        Confirmed: ['badge-confirmed', 'مؤكدة'],
        Paid: ['badge-paid', 'مدفوعة']
    };
    const [cls,label] = map[status] || ['badge-inactive', status];
    return `<span class="badge ${cls}">${label}</span>`;
}

// ════════════════════════════════════════
// TOAST
// ════════════════════════════════════════
function showToast(msg, type='success') {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation'
    };
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(()=>{
        toast.classList.add('fade-out');
        setTimeout(()=>toast.remove(), 300);
    }
    , 3500);
}

// ════════════════════════════════════════
// MODALS
// ════════════════════════════════════════
function confirmDelete(message, onConfirm) {
    document.getElementById('confirmMessage').textContent = message;
    const btn = document.getElementById('confirmBtn');
    btn.onclick = ()=>{
        closeModal('confirmModal');
        onConfirm();
    }
    ;
    openModal('confirmModal');
}
function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    if (!document.querySelector('.modal-overlay.open'))
        document.body.style.overflow = '';
}

// ════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════
function openSettings() {
    document.getElementById('apiUrl').value = API_URL;
    document.getElementById('settCompanyName').value = COMPANY.CompanyName || '';
    document.getElementById('settCompanyNameAr').value = COMPANY.CompanyNameAr || '';
    document.getElementById('settEmail').value = COMPANY.CompanyEmail || '';
    document.getElementById('settPhone').value = COMPANY.CompanyPhone || '';
    document.getElementById('settWebsite').value = COMPANY.CompanyWebsite || '';
    document.getElementById('settAddress').value = COMPANY.CompanyAddress || '';
    document.getElementById('settPortLoading').value = COMPANY.PortLoading || '';
    document.getElementById('settCurrency').value = CURRENCY;
    openModal('settingsModal');
}

async function saveSettings(e) {
    e.preventDefault();
    const newUrl = document.getElementById('apiUrl').value.trim();
    const newComp = {
        CompanyName: document.getElementById('settCompanyName').value.trim(),
        CompanyNameAr: document.getElementById('settCompanyNameAr').value.trim(),
        CompanyEmail: document.getElementById('settEmail').value.trim(),
        CompanyPhone: document.getElementById('settPhone').value.trim(),
        CompanyWebsite: document.getElementById('settWebsite').value.trim(),
        CompanyAddress: document.getElementById('settAddress').value.trim(),
        PortLoading: document.getElementById('settPortLoading').value.trim(),
    };
    const newCurr = document.getElementById('settCurrency').value;
    localStorage.setItem('egygulf_api_url', newUrl);
    localStorage.setItem('egygulf_company', JSON.stringify(newComp));
    localStorage.setItem('egygulf_currency', newCurr);
    API_URL = newUrl;
    COMPANY = newComp;
    CURRENCY = newCurr;
    invalidateCache('products', 'customers', 'salesTeam', 'socialTeam', 'invoices', 'flavors', 'commissions', 'todos');
    document.getElementById('apiBanner').style.display = 'none';
    try {
        await apiPost('saveSettings', {
            data: {
                ...newComp,
                Currency: newCurr,
                NextInvoiceNumber: '1001'
            }
        });
    } catch (_) {}
    closeModal('settingsModal');
    showToast('تم حفظ الإعدادات بنجاح');
    preloadAllData();
}

// ════════════════════════════════════════
// TAB 1: DASHBOARD
// ════════════════════════════════════════
async function loadDashboard() {
    try {
        const res = await apiGet('getDashboard');
        const d = res.data;
        document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-building"></i></div><div class="stat-label">إجمالي العملاء</div><div class="stat-value">${d.totalCustomers}</div></div>
      <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-box-open"></i></div><div class="stat-label">إجمالي المنتجات</div><div class="stat-value">${d.totalProducts}</div></div>
      <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-file-invoice"></i></div><div class="stat-label">إجمالي الفواتير</div><div class="stat-value">${d.totalInvoices}</div></div>
      <div class="stat-card"><div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div><div class="stat-label">إجمالي الإيرادات</div><div class="stat-value">${fmtNum(d.totalRevenue)}</div><div class="stat-sub">${CURRENCY}</div></div>
      <div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-handshake"></i></div><div class="stat-label">عمولات فريق المبيعات</div><div class="stat-value">${fmtNum(d.totalSalesCommission)}</div><div class="stat-sub">${CURRENCY}</div></div>
      <div class="stat-card"><div class="stat-icon red"><i class="fas fa-bullhorn"></i></div><div class="stat-label">عمولات فريق السوشيال</div><div class="stat-value">${fmtNum(d.totalSocialCommission)}</div><div class="stat-sub">${CURRENCY}</div></div>`;
        document.getElementById('topCustomerCard').innerHTML = d.topCustomer ? `<div class="top-entity"><div class="top-entity-avatar"><i class="fas fa-building"></i></div><div class="top-entity-info"><h4>${d.topCustomer.name}</h4><span>${fmt(d.topCustomer.revenue)}</span></div></div>` : '<p style="color:var(--text-muted)">لا توجد بيانات بعد</p>';
        document.getElementById('topProductCard').innerHTML = d.topProduct ? `<div class="top-entity"><div class="top-entity-avatar"><i class="fas fa-box-open"></i></div><div class="top-entity-info"><h4>${d.topProduct.name}</h4><span>${fmt(d.topProduct.revenue)}</span></div></div>` : '<p style="color:var(--text-muted)">لا توجد بيانات بعد</p>';
        const rows = (d.recentInvoices || []).map(inv=>`
      <tr>
        <td><strong>${inv.InvoiceNumber || inv.ID}</strong></td>
        <td>${fmtDate(inv.InvoiceDate)}</td>
        <td>${inv.CustomerName || '—'}</td>
        <td>${fmt(inv.GrandTotal)}</td>
        <td>${statusBadge(inv.Status)}</td>
      </tr>`).join('');
        document.getElementById('recentInvoicesBody').innerHTML = rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">لا توجد فواتير بعد</td></tr>';
    } catch (err) {
        if (err.message !== 'NO_API')
            showToast('خطأ في تحميل لوحة التحكم: ' + err.message, 'error');
        document.getElementById('statsGrid').innerHTML = `<div class="stat-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px">اضبط رابط الـ API لعرض البيانات</div>`;
    }
    // تحميل الأناليتيكس بشكل منفصل (مش بيأثر على بقية الداش)
    loadAnalytics();
}

// ════════════════════════════════════════
// DASHBOARD ANALYTICS
// ════════════════════════════════════════
async function loadAnalytics() {
    const el = document.getElementById('analyticsSection');
    if (!el)
        return;
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>جاري تحميل التحليلات...</div>`;
    try {
        const res = await apiGet('getAnalytics');
        const d = res.data;
        // handle both {topProducts,topFlavors,topCountries} and flat array responses
        const topProducts = d.topProducts || [];
        const topFlavors = d.topFlavors || [];
        const topCountries = d.topCountries || [];
        el.innerHTML = renderAnalytics(topProducts, topFlavors, topCountries);
        // ربط أحداث التوسيع
        el.querySelectorAll('.country-row-toggle').forEach(btn=>{
            btn.addEventListener('click', ()=>{
                const panel = document.getElementById(btn.dataset.target);
                const isOpen = panel.style.display !== 'none';
                panel.style.display = isOpen ? 'none' : 'block';
                btn.querySelector('i').style.transform = isOpen ? '' : 'rotate(180deg)';
            }
            );
        }
        );
    } catch (err) {
        if (err.message === 'NO_API') return;
        // fallback: نحسب التحليلات محلياً من الـ cache
        try {
            const invoices = cache.invoices || state.invoices || [];
            if (!invoices.length) {
                el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">لا توجد بيانات كافية للتحليل</div>`;
                return;
            }
            const productMap = {};
            const flavorMap = {};
            const countryMap = {};
            for (const inv of invoices) {
                const country = inv.Country || inv.CustomerCountry || '';
                if (country) {
                    if (!countryMap[country]) countryMap[country] = {country, invoiceCount:0, revenue:0, topProducts:[], topFlavors:[]};
                    countryMap[country].invoiceCount++;
                    countryMap[country].revenue += parseFloat(inv.GrandTotal) || 0;
                }
            }
            // نحسب من invoice items لو موجودة
            const allItems = Object.values(cache.invoiceItems || {}).flat();
            for (const item of allItems) {
                const name = item.ProductName || item.product || '';
                if (!name) continue;
                if (!productMap[name]) productMap[name] = {name, cartons:0, revenue:0, topFlavors:[]};
                productMap[name].cartons += parseFloat(item.Cartons || item.cartons || 0);
                productMap[name].revenue += parseFloat(item.Total || item.total || 0);
            }
            const topProducts = Object.values(productMap).sort((a,b)=>b.cartons-a.cartons).slice(0,10);
            const topFlavors = Object.values(flavorMap).sort((a,b)=>b.count-a.count).slice(0,10);
            const topCountries = Object.values(countryMap).sort((a,b)=>b.invoiceCount-a.invoiceCount).slice(0,10).map(c=>({...c, topProducts:[], topFlavors:[]}));
            el.innerHTML = renderAnalytics(topProducts, topFlavors, topCountries);
            el.querySelectorAll('.country-row-toggle').forEach(btn=>{
                btn.addEventListener('click', ()=>{
                    const panel = document.getElementById(btn.dataset.target);
                    const isOpen = panel.style.display !== 'none';
                    panel.style.display = isOpen ? 'none' : 'block';
                    btn.querySelector('i').style.transform = isOpen ? '' : 'rotate(180deg)';
                });
            });
        } catch(fallbackErr) {
            el.innerHTML = `<div style="background:#2d1b1b;border:1px solid var(--danger);border-radius:8px;padding:16px;margin:8px 0">
        <div style="color:var(--danger);font-weight:700;margin-bottom:6px"><i class="fas fa-circle-xmark" style="margin-left:6px"></i>خطأ في تحميل التحليلات</div>
        <code style="color:#ff8080;font-size:12px;word-break:break-all">${err.message}</code>
      </div>`;
        }
    }
}

function analyticsBar(value, max, color) {
    const pct = max ? Math.round((value / max) * 100) : 0;
    return `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
    <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width .4s"></div>
    </div>
    <span style="font-size:11px;color:var(--text-muted);min-width:28px;text-align:right">${pct}%</span>
  </div>`;
}

function flavorTags(flavors) {
    if (!flavors || !flavors.length)
        return '<span style="color:var(--text-muted);font-size:12px">—</span>';
    const colors = ['#e74c3c', '#e67e22', '#8e44ad', '#2980b9', '#27ae60', '#c0392b', '#16a085'];
    return flavors.map((f,i)=>`<span style="display:inline-flex;align-items:center;gap:4px;background:${colors[i % colors.length]}22;color:${colors[i % colors.length]};border:1px solid ${colors[i % colors.length]}55;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600;margin:2px">
    <i class="fas fa-pepper-hot" style="font-size:9px"></i>${f.name}<span style="opacity:.7">(${f.count})</span>
  </span>`).join('');
}

function renderAnalytics(topProducts, topFlavors, topCountries) {
    const maxProductCartons = topProducts[0]?.cartons || 1;
    const maxFlavorCount = topFlavors[0]?.count || 1;
    const maxCountryInv = topCountries[0]?.invoiceCount || 1;

    // ─── أعلى المنتجات ───
    const productsHtml = topProducts.length ? topProducts.map((p,i)=>`
    <div style="padding:14px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:1px">
            <i class="fas fa-boxes" style="margin-left:4px"></i>${p.cartons.toLocaleString()} كرتون
            &nbsp;·&nbsp;
            <i class="fas fa-dollar-sign" style="margin-left:4px"></i>${fmtNum(p.revenue)} ${CURRENCY}
          </div>
          ${analyticsBar(p.cartons, maxProductCartons, 'var(--accent)')}
          ${p.topFlavors.length ? `<div style="margin-top:8px">${flavorTags(p.topFlavors)}</div>` : ''}
        </div>
      </div>
    </div>`).join('') : '<p style="color:var(--text-muted);text-align:center;padding:20px">لا توجد بيانات</p>';

    // ─── أعلى النكهات ───
    const flavorsHtml = topFlavors.length ? topFlavors.map((f,i)=>{
        const colors = ['#e74c3c', '#e67e22', '#8e44ad', '#2980b9', '#27ae60', '#c0392b', '#16a085', '#d35400', '#1abc9c', '#2c3e50'];
        const c = colors[i % colors.length];
        return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:24px;height:24px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">${i + 1}</div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:13px">${f.name}</span>
            <span style="font-size:12px;color:${c};font-weight:700">${f.count} مرة</span>
          </div>
          ${analyticsBar(f.count, maxFlavorCount, c)}
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px"><i class="fas fa-box" style="margin-left:3px"></i>${f.cartons.toLocaleString()} كرتون</div>
        </div>
      </div>
    </div>`;
    }
    ).join('') : '<p style="color:var(--text-muted);text-align:center;padding:20px">لا توجد بيانات</p>';

    // ─── أعلى الدول ───
    const flagEmoji = (country)=>{
        const flags = {
            'Saudi Arabia': '🇸🇦',
            'UAE': '🇦🇪',
            'Egypt': '🇪🇬',
            'Kuwait': '🇰🇼',
            'Qatar': '🇶🇦',
            'Bahrain': '🇧🇭',
            'Oman': '🇴🇲',
            'Jordan': '🇯🇴',
            'Libya': '🇱🇾',
            'Sudan': '🇸🇩',
            'Iraq': '🇮🇶',
            'Yemen': '🇾🇪',
            'Morocco': '🇲🇦',
            'Tunisia': '🇹🇳',
            'Algeria': '🇩🇿'
        };
        return flags[country] || '🌍';
    }
    ;

    const countriesHtml = topCountries.length ? topCountries.map((c,i)=>{
        const panelId = `country-panel-${i}`;
        const prodRows = c.topProducts.map(p=>`
      <tr>
        <td style="padding:6px 10px;font-size:12px"><i class="fas fa-box-open" style="margin-left:6px;color:var(--accent)"></i>${p.name}</td>
        <td style="padding:6px 10px;text-align:center;font-size:12px">${p.cartons.toLocaleString()}</td>
        <td style="padding:6px 10px;text-align:right;font-size:12px;color:var(--success)">${fmtNum(p.revenue)}</td>
      </tr>`).join('');
        const flavorRows = c.topFlavors.map(f=>`
      <span style="display:inline-flex;align-items:center;gap:3px;background:var(--accent-light);color:var(--accent);border:1px solid var(--accent);border-radius:20px;padding:2px 10px;font-size:11px;margin:2px">
        <i class="fas fa-pepper-hot" style="font-size:9px"></i>${f.name} <span style="opacity:.7">(${f.count})</span>
      </span>`).join('');

        return `
    <div style="border:1px solid var(--border);border-radius:10px;margin-bottom:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:var(--bg-card);cursor:pointer" class="country-row-toggle" data-target="${panelId}">
        <span style="font-size:28px;line-height:1">${flagEmoji(c.country)}</span>
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px">${c.country}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
            <i class="fas fa-file-invoice" style="margin-left:4px"></i>${c.invoiceCount} فاتورة
            &nbsp;·&nbsp;
            <i class="fas fa-dollar-sign" style="margin-left:4px"></i>${fmtNum(c.revenue)} ${CURRENCY}
          </div>
          ${analyticsBar(c.invoiceCount, maxCountryInv, '#3498db')}
        </div>
        <div style="width:28px;height:28px;border-radius:50%;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:var(--text-muted)">${i + 1}</div>
        <i class="fas fa-chevron-down" style="color:var(--text-muted);transition:transform .3s;font-size:13px"></i>
      </div>
      <div id="${panelId}" style="display:none;padding:16px;background:var(--bg-base);border-top:1px solid var(--border)">
        ${c.topProducts.length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">أعلى المنتجات</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--bg-elevated)">
              <th style="padding:6px 10px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:600">المنتج</th>
              <th style="padding:6px 10px;text-align:center;font-size:11px;color:var(--text-muted);font-weight:600">كرتون</th>
              <th style="padding:6px 10px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:600">${CURRENCY}</th>
            </tr></thead>
            <tbody>${prodRows}</tbody>
          </table>
        </div>` : ''}
        ${c.topFlavors.length ? `
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">النكهات المطلوبة</div>
          <div>${flavorRows}</div>
        </div>` : ''}
      </div>
    </div>`;
    }
    ).join('') : '<p style="color:var(--text-muted);text-align:center;padding:20px">لا توجد بيانات</p>';

    return `
  <div style="margin-top:32px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
      <div style="width:4px;height:28px;background:var(--accent);border-radius:2px"></div>
      <h2 style="font-size:18px;font-weight:800;color:var(--text-primary)">تحليلات المبيعات</h2>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">

      <!-- أعلى المنتجات -->
      <div class="card" style="padding:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--accent-light);color:var(--accent);display:flex;align-items:center;justify-content:center">
            <i class="fas fa-box-open"></i>
          </div>
          <div>
            <div style="font-weight:700;font-size:14px">أعلى المنتجات مبيعاً</div>
            <div style="font-size:11px;color:var(--text-muted)">مرتّبة بالكرتون</div>
          </div>
        </div>
        ${productsHtml}
      </div>

      <!-- أعلى النكهات -->
      <div class="card" style="padding:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
          <div style="width:32px;height:32px;border-radius:8px;background:#e74c3c22;color:#e74c3c;display:flex;align-items:center;justify-content:center">
            <i class="fas fa-pepper-hot"></i>
          </div>
          <div>
            <div style="font-weight:700;font-size:14px">أكثر النكهات طلباً</div>
            <div style="font-size:11px;color:var(--text-muted)">مرتّبة بعدد الطلبات</div>
          </div>
        </div>
        ${flavorsHtml}
      </div>
    </div>

    <!-- أعلى الدول -->
    <div class="card" style="padding:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
        <div style="width:32px;height:32px;border-radius:8px;background:#3498db22;color:#3498db;display:flex;align-items:center;justify-content:center">
          <i class="fas fa-globe"></i>
        </div>
        <div>
          <div style="font-weight:700;font-size:14px">أعلى 10 دول</div>
          <div style="font-size:11px;color:var(--text-muted)">اضغط على الدولة لرؤية المنتجات والنكهات</div>
        </div>
      </div>
      ${countriesHtml}
    </div>
  </div>`;
}

// ════════════════════════════════════════
// TAB 2: PRODUCTS
// ════════════════════════════════════════
async function loadProducts() {
    try {
        state.products = await cached('products', 'getProducts');
        populateCategoryFilter();
        renderProducts(state.products);
    } catch (err) {
        if (err.message !== 'NO_API')
            showToast('خطأ في تحميل المنتجات', 'error');
    }
}

function populateCategoryFilter() {
    const cats = [...new Set(state.products.map(p=>p.Category).filter(Boolean))];
    document.getElementById('productCategoryFilter').innerHTML = '<option value="">كل التصنيفات</option>' + cats.map(c=>`<option>${c}</option>`).join('');
}

function renderProducts(list) {
    const tbody = document.getElementById('productsTableBody');
    const empty = document.getElementById('productsEmpty');
    if (!list.length) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = list.map(p=>`
    <tr>
      <td><strong>${p.ProductName}</strong></td>
      <td>${p.Category || '—'}</td>
      <td>${p.Size || '—'}</td>
      <td>${p.UnitsPerCarton || '—'}</td>
      <td>${p.CartonWeight ? p.CartonWeight + ' كجم' : '—'}</td>
      <td>${fmt(p.PricePerCarton)}</td>
      <td><code style="font-size:12px;color:var(--text-muted)">${p.SKU || '—'}</code></td>
      <td>${statusBadge(p.Status || 'Active')}</td>
      <td><div class="action-btns">
        <button class="btn-icon edit" onclick="openProductModal('${p.ID}')"><i class="fas fa-pen"></i></button>
        <button class="btn-icon" style="background:var(--accent-light);color:var(--accent)" title="النكهات" onclick="openFlavorsModal('${p.ID}','${p.ProductName}')"><i class="fas fa-pepper-hot"></i></button>
        <button class="btn-icon del"  onclick="deleteProduct('${p.ID}','${p.ProductName}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}

function filterProducts() {
    const q = document.getElementById('productSearch').value.toLowerCase();
    const cat = document.getElementById('productCategoryFilter').value;
    const stat = document.getElementById('productStatusFilter').value;
    renderProducts(state.products.filter(p=>(!q || p.ProductName?.toLowerCase().includes(q) || p.SKU?.toLowerCase().includes(q)) && (!cat || p.Category === cat) && (!stat || p.Status === stat)));
}

function openProductModal(id=null) {
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productModalTitle').textContent = 'إضافة منتج جديد';
    const cats = [...new Set(state.products.map(p=>p.Category).filter(Boolean))];
    document.getElementById('categoryList').innerHTML = cats.map(c=>`<option value="${c}">`).join('');
    if (id) {
        const p = state.products.find(x=>x.ID === id);
        if (!p)
            return;
        document.getElementById('productModalTitle').textContent = 'تعديل المنتج';
        document.getElementById('productId').value = p.ID;
        document.getElementById('pName').value = p.ProductName || '';
        document.getElementById('pCategory').value = p.Category || '';
        document.getElementById('pSize').value = p.Size || '';
        document.getElementById('pUnits').value = p.UnitsPerCarton || '';
        document.getElementById('pWeight').value = p.CartonWeight || '';
        document.getElementById('pDimensions').value = p.CartonDimensions || '';
        document.getElementById('pPrice').value = p.PricePerCarton || '';
        document.getElementById('pSKU').value = p.SKU || '';
        document.getElementById('pStatus').value = p.Status || 'Active';
    }
    openModal('productModal');
}

async function saveProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('productSaveBtn');
    btn.disabled = true;
    const id = document.getElementById('productId').value;
    const data = {
        ID: id || undefined,
        ProductName: document.getElementById('pName').value.trim(),
        Category: document.getElementById('pCategory').value.trim(),
        Size: document.getElementById('pSize').value.trim(),
        UnitsPerCarton: parseFloat(document.getElementById('pUnits').value) || 0,
        CartonWeight: parseFloat(document.getElementById('pWeight').value) || 0,
        CartonDimensions: document.getElementById('pDimensions').value.trim(),
        PricePerCarton: parseFloat(document.getElementById('pPrice').value) || 0,
        SKU: document.getElementById('pSKU').value.trim(),
        Status: document.getElementById('pStatus').value,
    };
    try {
        if (id)
            await apiPost('updateProduct', {
                id,
                data
            });
        else
            await apiPost('addProduct', {
                data
            });
        invalidateCache('products');
        closeModal('productModal');
        showToast(id ? 'تم تحديث المنتج بنجاح' : 'تم إضافة المنتج بنجاح');
        await loadProducts();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function deleteProduct(id, name) {
    confirmDelete(`هل تريد حذف المنتج "${name}"؟`, async()=>{
        try {
            await apiPost('deleteProduct', {
                id
            });
            invalidateCache('products');
            showToast('تم حذف المنتج');
            await loadProducts();
        } catch (err) {
            showToast('خطأ: ' + err.message, 'error');
        }
    }
    );
}

// ════════════════════════════════════════
// TAB 3: CUSTOMERS
// ════════════════════════════════════════
async function loadCustomers() {
    try {
        [state.customers,state.invoices] = await Promise.all([cached('customers', 'getCustomers'), cached('invoices', 'getInvoices'), ]);
        populateCountryFilter();
        renderCustomers(state.customers);
    } catch (err) {
        if (err.message !== 'NO_API')
            showToast('خطأ في تحميل العملاء', 'error');
    }
}

function populateCountryFilter() {
    const countries = [...new Set(state.customers.map(c=>c.Country).filter(Boolean))];
    document.getElementById('customerCountryFilter').innerHTML = '<option value="">كل الدول</option>' + countries.map(c=>`<option>${c}</option>`).join('');
}

function getCustomerStats(customerId) {
    const invs = state.invoices.filter(i=>i.CustomerID === customerId);
    const revenue = invs.reduce((s,i)=>s + (parseFloat(i.GrandTotal) || 0), 0);
    const last = invs.sort((a,b)=>new Date(b.InvoiceDate) - new Date(a.InvoiceDate))[0];
    return {
        count: invs.length,
        revenue,
        lastDate: last?.InvoiceDate
    };
}

function renderCustomers(list) {
    const tbody = document.getElementById('customersTableBody');
    const empty = document.getElementById('customersEmpty');
    if (!list.length) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = list.map(c=>{
        const stats = getCustomerStats(c.ID);
        return `<tr>
      <td><strong>${c.CompanyName}</strong></td>
      <td>${c.ContactPerson || '—'}</td>
      <td>${c.Country || '—'}</td>
      <td>${c.Phone || '—'}</td>
      <td><span style="color:var(--info)">${stats.count}</span></td>
      <td>${fmt(stats.revenue)}</td>
      <td>${fmtDate(stats.lastDate)}</td>
      <td><div class="action-btns">
        <button class="btn-icon edit" onclick="openCustomerModal('${c.ID}')"><i class="fas fa-pen"></i></button>
        <button class="btn-icon del"  onclick="deleteCustomer('${c.ID}','${c.CompanyName}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
    }
    ).join('');
}

function filterCustomers() {
    const q = document.getElementById('customerSearch').value.toLowerCase();
    const country = document.getElementById('customerCountryFilter').value;
    renderCustomers(state.customers.filter(c=>(!q || c.CompanyName?.toLowerCase().includes(q) || c.ContactPerson?.toLowerCase().includes(q)) && (!country || c.Country === country)));
}

function openCustomerModal(id=null) {
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
    document.getElementById('customerModalTitle').textContent = 'إضافة عميل جديد';
    if (id) {
        const c = state.customers.find(x=>x.ID === id);
        if (!c)
            return;
        document.getElementById('customerModalTitle').textContent = 'تعديل العميل';
        document.getElementById('customerId').value = c.ID;
        document.getElementById('cCompany').value = c.CompanyName || '';
        document.getElementById('cContact').value = c.ContactPerson || '';
        document.getElementById('cEmail').value = c.Email || '';
        document.getElementById('cPhone').value = c.Phone || '';
        document.getElementById('cWebsite').value = c.Website || '';
        document.getElementById('cCountry').value = c.Country || '';
        document.getElementById('cCity').value = c.City || '';
        document.getElementById('cAddress').value = c.Address || '';
        document.getElementById('cTax').value = c.TaxNumber || '';
        document.getElementById('cNotes').value = c.Notes || '';
    }
    openModal('customerModal');
}

async function saveCustomer(e) {
    e.preventDefault();
    const btn = document.getElementById('customerSaveBtn');
    btn.disabled = true;
    const id = document.getElementById('customerId').value;
    const data = {
        ID: id || undefined,
        CompanyName: document.getElementById('cCompany').value.trim(),
        ContactPerson: document.getElementById('cContact').value.trim(),
        Email: document.getElementById('cEmail').value.trim(),
        Phone: document.getElementById('cPhone').value.trim(),
        Website: document.getElementById('cWebsite').value.trim(),
        Country: document.getElementById('cCountry').value,
        City: document.getElementById('cCity').value.trim(),
        Address: document.getElementById('cAddress').value.trim(),
        TaxNumber: document.getElementById('cTax').value.trim(),
        Notes: document.getElementById('cNotes').value.trim(),
    };
    try {
        if (id)
            await apiPost('updateCustomer', {
                id,
                data
            });
        else
            await apiPost('addCustomer', {
                data
            });
        invalidateCache('customers');
        closeModal('customerModal');
        showToast(id ? 'تم تحديث العميل' : 'تم إضافة العميل');
        await loadCustomers();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function deleteCustomer(id, name) {
    confirmDelete(`هل تريد حذف العميل "${name}"؟`, async()=>{
        try {
            await apiPost('deleteCustomer', {
                id
            });
            invalidateCache('customers');
            showToast('تم حذف العميل');
            await loadCustomers();
        } catch (err) {
            showToast('خطأ: ' + err.message, 'error');
        }
    }
    );
}

// ════════════════════════════════════════
// TAB 4: SALES TEAM
// ════════════════════════════════════════
async function loadSalesTeam() {
    try {
        const [salesTeam,invoices,commissions] = await Promise.all([cached('salesTeam', 'getSalesTeam'), cached('invoices', 'getInvoices'), cached('commissions', 'getCommissions'), ]);
        state.salesTeam = salesTeam;
        state.invoices = invoices;
        renderSalesTeam(state.salesTeam, commissions);
    } catch (err) {
        if (err.message !== 'NO_API')
            showToast('خطأ في تحميل فريق المبيعات', 'error');
    }
}

function getSalesStats(memberId, commissions, type='Sales') {
    const comms = commissions.filter(c=>c.RepID === memberId && c.Type === type);
    const total = comms.reduce((s,c)=>s + (parseFloat(c.CommissionAmount) || 0), 0);
    const invs = state.invoices.filter(i=>(type === 'Sales' ? i.SalesRepID : i.SocialRepID) === memberId);
    return {
        count: invs.length,
        revenue: invs.reduce((s,i)=>s + (parseFloat(i.GrandTotal) || 0), 0),
        commission: total
    };
}

function renderSalesTeam(list, commissions) {
    const grid = document.getElementById('salesTeamGrid');
    const empty = document.getElementById('salesEmpty');
    if (!list.length) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    grid.innerHTML = list.map(m=>{
        const stats = getSalesStats(m.ID, commissions, 'Sales');
        const initials = (m.EmployeeName || 'U').split(' ').map(w=>w[0]).join('').slice(0, 2).toUpperCase();
        return `<div class="team-card">
      <div class="team-card-header">
        <div class="team-avatar">${initials}</div>
        <div class="team-info"><h4>${m.EmployeeName}</h4><p>عمولة: ${m.CommissionPercent}%</p><p style="margin-top:2px">${m.Phone || m.Email || ''}</p></div>
      </div>
      <div class="team-card-stats">
        <div class="team-stat"><div class="ts-val">${stats.count}</div><div class="ts-lbl">فواتير</div></div>
        <div class="team-stat"><div class="ts-val">${fmtNum(stats.revenue)}</div><div class="ts-lbl">مبيعات (${CURRENCY})</div></div>
        <div class="team-stat"><div class="ts-val" style="color:var(--success)">${fmtNum(stats.commission)}</div><div class="ts-lbl">عمولة (${CURRENCY})</div></div>
      </div>
      <div class="team-card-actions">
        <button class="btn btn-sm btn-ghost" onclick="openSalesModal('${m.ID}')"><i class="fas fa-pen"></i> تعديل</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="deleteSalesMember('${m.ID}','${m.EmployeeName}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
    }
    ).join('');
}

function openSalesModal(id=null) {
    document.getElementById('salesForm').reset();
    document.getElementById('salesId').value = '';
    document.getElementById('salesModalTitle').textContent = 'إضافة موظف مبيعات';
    if (id) {
        const m = state.salesTeam.find(x=>x.ID === id);
        if (!m)
            return;
        document.getElementById('salesModalTitle').textContent = 'تعديل موظف مبيعات';
        document.getElementById('salesId').value = m.ID;
        document.getElementById('sName').value = m.EmployeeName || '';
        document.getElementById('sEmail').value = m.Email || '';
        document.getElementById('sPhone').value = m.Phone || '';
        document.getElementById('sCommission').value = m.CommissionPercent || '';
    }
    openModal('salesModal');
}

async function saveSalesMember(e) {
    e.preventDefault();
    const id = document.getElementById('salesId').value;
    const data = {
        ID: id || undefined,
        EmployeeName: document.getElementById('sName').value.trim(),
        Email: document.getElementById('sEmail').value.trim(),
        Phone: document.getElementById('sPhone').value.trim(),
        CommissionPercent: parseFloat(document.getElementById('sCommission').value) || 0,
    };
    try {
        if (id)
            await apiPost('updateSalesMember', {
                id,
                data
            });
        else
            await apiPost('addSalesMember', {
                data
            });
        invalidateCache('salesTeam');
        closeModal('salesModal');
        showToast(id ? 'تم التحديث' : 'تم الإضافة');
        await loadSalesTeam();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    }
}

async function deleteSalesMember(id, name) {
    confirmDelete(`هل تريد حذف "${name}"؟`, async()=>{
        try {
            await apiPost('deleteSalesMember', {
                id
            });
            invalidateCache('salesTeam');
            showToast('تم الحذف');
            await loadSalesTeam();
        } catch (err) {
            showToast('خطأ: ' + err.message, 'error');
        }
    }
    );
}

// ════════════════════════════════════════
// TAB 5: SOCIAL TEAM
// ════════════════════════════════════════
async function loadSocialTeam() {
    try {
        const [socialTeam,invoices,commissions] = await Promise.all([cached('socialTeam', 'getSocialTeam'), cached('invoices', 'getInvoices'), cached('commissions', 'getCommissions'), ]);
        state.socialTeam = socialTeam;
        state.invoices = invoices;
        renderSocialTeam(state.socialTeam, commissions);
    } catch (err) {
        if (err.message !== 'NO_API')
            showToast('خطأ في تحميل فريق السوشيال', 'error');
    }
}

function renderSocialTeam(list, commissions) {
    const grid = document.getElementById('socialTeamGrid');
    const empty = document.getElementById('socialEmpty');
    if (!list.length) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    grid.innerHTML = list.map(m=>{
        const stats = getSalesStats(m.ID, commissions, 'Social');
        const initials = (m.EmployeeName || 'U').split(' ').map(w=>w[0]).join('').slice(0, 2).toUpperCase();
        return `<div class="team-card">
      <div class="team-card-header">
        <div class="team-avatar social">${initials}</div>
        <div class="team-info"><h4>${m.EmployeeName}</h4><p>عمولة: ${m.CommissionPercent}%</p><p style="margin-top:2px">${m.Phone || m.Email || ''}</p></div>
      </div>
      <div class="team-card-stats">
        <div class="team-stat"><div class="ts-val" style="color:var(--info)">${m.LeadsGenerated || 0}</div><div class="ts-lbl">عملاء محتملين</div></div>
        <div class="team-stat"><div class="ts-val">${stats.count}</div><div class="ts-lbl">صفقات مغلقة</div></div>
        <div class="team-stat"><div class="ts-val" style="color:var(--success)">${fmtNum(stats.commission)}</div><div class="ts-lbl">عمولة (${CURRENCY})</div></div>
      </div>
      <div class="team-card-actions">
        <button class="btn btn-sm btn-ghost" onclick="openSocialModal('${m.ID}')"><i class="fas fa-pen"></i> تعديل</button>
        <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="deleteSocialMember('${m.ID}','${m.EmployeeName}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
    }
    ).join('');
}

function openSocialModal(id=null) {
    document.getElementById('socialForm').reset();
    document.getElementById('socialId').value = '';
    document.getElementById('socialModalTitle').textContent = 'إضافة موظف سوشيال';
    if (id) {
        const m = state.socialTeam.find(x=>x.ID === id);
        if (!m)
            return;
        document.getElementById('socialModalTitle').textContent = 'تعديل موظف سوشيال';
        document.getElementById('socialId').value = m.ID;
        document.getElementById('smName').value = m.EmployeeName || '';
        document.getElementById('smEmail').value = m.Email || '';
        document.getElementById('smPhone').value = m.Phone || '';
        document.getElementById('smCommission').value = m.CommissionPercent || '';
    }
    openModal('socialModal');
}

async function saveSocialMember(e) {
    e.preventDefault();
    const id = document.getElementById('socialId').value;
    const data = {
        ID: id || undefined,
        EmployeeName: document.getElementById('smName').value.trim(),
        Email: document.getElementById('smEmail').value.trim(),
        Phone: document.getElementById('smPhone').value.trim(),
        CommissionPercent: parseFloat(document.getElementById('smCommission').value) || 0,
    };
    try {
        if (id)
            await apiPost('updateSocialMember', {
                id,
                data
            });
        else
            await apiPost('addSocialMember', {
                data
            });
        invalidateCache('socialTeam');
        closeModal('socialModal');
        showToast(id ? 'تم التحديث' : 'تم الإضافة');
        await loadSocialTeam();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    }
}

async function deleteSocialMember(id, name) {
    confirmDelete(`هل تريد حذف "${name}"؟`, async()=>{
        try {
            await apiPost('deleteSocialMember', {
                id
            });
            invalidateCache('socialTeam');
            showToast('تم الحذف');
            await loadSocialTeam();
        } catch (err) {
            showToast('خطأ: ' + err.message, 'error');
        }
    }
    );
}

// ════════════════════════════════════════
// TAB 6: INVOICES
// ════════════════════════════════════════
async function loadInvoices() {
    try {
        state.invoices = await cached('invoices', 'getInvoices');
        renderInvoices(state.invoices);
        updateNotifBell();
    } catch (err) {
        if (err.message !== 'NO_API')
            showToast('خطأ في تحميل الفواتير', 'error');
    }
}

function renderInvoices(list) {
    const tbody = document.getElementById('invoicesTableBody');
    const empty = document.getElementById('invoicesEmpty');
    const sorted = [...list].sort((a,b)=>new Date(b.InvoiceDate) - new Date(a.InvoiceDate));
    if (!sorted.length) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = sorted.map(inv=>`
    <tr>
      <td><strong>${inv.InvoiceNumber || inv.ID}</strong></td>
      <td>${fmtDate(inv.InvoiceDate)}</td>
      <td>${inv.CustomerName || '—'}</td>
      <td>${inv.SalesRepName || '—'}</td>
      <td>${fmt(inv.GrandTotal)}</td>
      <td style="color:var(--success)">${fmt(inv.SalesCommission)}</td>
      <td style="color:var(--info)">${fmt(inv.SocialCommission)}</td>
      <td>${statusBadge(inv.Status)}</td>
      <td>${healthCertBadge(inv.HealthCert)}</td>
      <td><div class="action-btns">
        <button class="btn-icon view"  title="معاينة" onclick="viewInvoice('${inv.ID}')"><i class="fas fa-eye"></i></button>
        <button class="btn-icon print" title="طباعة فاتورة" onclick="printInvoiceDirect('${inv.ID}')"><i class="fas fa-print"></i></button>
        <button class="btn-icon" style="background:#fff3e0;color:#e67e22" title="أمر إنتاج" onclick="printProductionOrder('${inv.ID}')"><i class="fas fa-industry"></i></button>
        <button class="btn-icon edit"  title="تعديل" onclick="editInvoice('${inv.ID}')"><i class="fas fa-pen"></i></button>
        <select onchange="changeInvoiceStatus('${inv.ID}',this.value)" style="border:1px solid var(--border);border-radius:6px;padding:4px 6px;font-size:12px;background:var(--bg-card);color:var(--text-primary);cursor:pointer;font-family:inherit">
          <option value="Draft"     ${inv.Status === 'Draft' ? 'selected' : ''}>مسودة</option>
          <option value="Confirmed" ${inv.Status === 'Confirmed' ? 'selected' : ''}>مؤكدة</option>
          <option value="Paid"      ${inv.Status === 'Paid' ? 'selected' : ''}>مدفوعة</option>
        </select>
        <button class="btn-icon del"   title="حذف"    onclick="deleteInvoice('${inv.ID}','${inv.InvoiceNumber || inv.ID}')"><i class="fas fa-trash"></i></button>
        <button class="btn-icon" style="background:${inv.HealthCert === 'يوجد' ? '#d4edda;color:#155724' : inv.HealthCert === 'لا يوجد' ? '#f8d7da;color:#721c24' : '#fff3cd;color:#856404'}" title="الشهادة الصحية" onclick="toggleHealthCert('${inv.ID}','${inv.HealthCert || ''}')"><i class="fas fa-${inv.HealthCert === 'يوجد' ? 'check-circle' : inv.HealthCert === 'لا يوجد' ? 'times-circle' : 'clock'}"></i></button>
      </div></td>
    </tr>`).join('');
}

// ── HEALTH CERTIFICATE ──
function healthCertBadge(val) {
    if (val === 'يوجد')
        return '<span class="badge" style="background:var(--success-light,#d4edda);color:var(--success,#27ae60);border:1px solid var(--success,#27ae60)"><i class="fas fa-check-circle" style="margin-left:4px"></i>يوجد</span>';
    if (val === 'لا يوجد')
        return '<span class="badge" style="background:#f8d7da;color:#721c24;border:1px solid #f5c6cb"><i class="fas fa-times-circle" style="margin-left:4px"></i>لا يوجد</span>';
    return '<span class="badge" style="background:#fff3cd;color:#856404;border:1px solid #ffc107"><i class="fas fa-clock" style="margin-left:4px"></i>لم يتم بعد</span>';
}

function toggleHealthCert(id, current) {
    // Remove existing modal if any
    const existing = document.getElementById('healthCertModal');
    if (existing)
        existing.remove();

    const modal = document.createElement('div');
    modal.id = 'healthCertModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
    <div style="background:var(--bg-card,#1e1e2e);border-radius:12px;padding:28px 32px;min-width:300px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
      <h3 style="margin:0 0 8px;color:var(--text-primary,#fff);font-size:16px">الشهادة الصحية</h3>
      <p style="margin:0 0 20px;color:var(--text-muted,#aaa);font-size:13px">اختر الحالة</p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="setHealthCert('${id}','يوجد')" style="padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;background:#d4edda;color:#155724"><i class="fas fa-check-circle" style="margin-left:6px"></i>يوجد</button>
        <button onclick="setHealthCert('${id}','لا يوجد')" style="padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;background:#f8d7da;color:#721c24"><i class="fas fa-times-circle" style="margin-left:6px"></i>لا يوجد</button>
        <button onclick="setHealthCert('${id}','لم يتم بعد')" style="padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:600;background:#fff3cd;color:#856404"><i class="fas fa-clock" style="margin-left:6px"></i>لم يتم بعد</button>
        <button onclick="document.getElementById('healthCertModal').remove()" style="padding:8px 20px;border-radius:8px;border:1px solid #444;cursor:pointer;font-size:13px;background:transparent;color:#aaa;margin-top:4px">إلغاء</button>
      </div>
    </div>`;
    modal.addEventListener('click', e=>{
        if (e.target === modal)
            modal.remove();
    }
    );
    document.body.appendChild(modal);
}

async function setHealthCert(id, newVal) {
    document.getElementById('healthCertModal')?.remove();
    try {
        await apiPost('updateInvoiceStatus', {
            id,
            data: {
                HealthCert: newVal
            }
        });
        // invalidate ثم اجلب fresh data صراحةً
        invalidateCache('invoices');
        const freshRes = await apiGet('getInvoices');
        cache.invoices = freshRes.data || [];
        state.invoices = cache.invoices;
        const labels = {
            'يوجد': 'تم تسجيل الشهادة الصحية ✓',
            'لا يوجد': 'لا يوجد شهادة صحية',
            'لم يتم بعد': 'تم إعادة تعيين الشهادة'
        };
        showToast(labels[newVal] || 'تم التحديث');
        renderInvoices(state.invoices);
        updateNotifBell();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    }
}

// ── NOTIFICATIONS ──
function updateNotifBell() {
    const invoices = (state.invoices && state.invoices.length > 0) ? state.invoices : (cache.invoices || []);
    const missing = invoices.filter(i=>{
        const cert = i.HealthCert || '';
        const notDone = cert !== 'يوجد';
        return notDone;
    }
    );
    const badge = document.getElementById('notifBadge');
    const bell = document.getElementById('notifBell');
    if (!badge)
        return;
    if (missing.length > 0) {
        badge.textContent = missing.length;
        badge.style.display = 'flex';
        bell.classList.add('notif-active');
    } else {
        badge.style.display = 'none';
        bell.classList.remove('notif-active');
    }
    renderNotifList(missing);
}

function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block')
        updateNotifBell();
}

function renderNotifList(missing) {
    const el = document.getElementById('notifList');
    if (!el)
        return;
    if (!missing.length) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--success)"><i class="fas fa-check-circle" style="font-size:24px;display:block;margin-bottom:8px"></i>كل الفواتير لديها شهادة صحية!</div>';
        return;
    }
    el.innerHTML = missing.map(inv=>`
    <div class="notif-item" onclick="navigateTo('invoices');toggleNotifPanel()">
      <div style="font-weight:700;font-size:13px">${inv.InvoiceNumber || inv.ID}</div>
      <div style="font-size:12px;color:var(--text-muted)">${inv.CustomerName || '—'} · ${fmtDate(inv.InvoiceDate)}</div>
      <div style="font-size:12px;margin-top:2px">${fmt(inv.GrandTotal)}</div>
    </div>
  `).join('');
}

function filterInvoices() {
    const q = document.getElementById('invoiceSearch').value.toLowerCase();
    const stat = document.getElementById('invoiceStatusFilter').value;
    renderInvoices(state.invoices.filter(i=>(!q || (i.InvoiceNumber || '').toLowerCase().includes(q) || (i.CustomerName || '').toLowerCase().includes(q)) && (!stat || i.Status === stat)));
}

// ── SHIPPING / LOADING DATES TAB ──
async function loadShippingDates() {
    try {
        state.invoices = await cached('invoices', 'getInvoices');
        renderShippingDates(state.invoices);
    } catch (err) {
        if (err.message !== 'NO_API')
            showToast('خطأ في تحميل الفواتير', 'error');
    }
}

/** بيرجع عدد الأيام المتبقية (سالب لو فات الميعاد) */
function daysUntil(dateStr) {
    if (!dateStr)
        return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
}

/** بيرجع نص + لون حسب عدد الأيام المتبقية لميعاد التحميل */
function shippingCountdownInfo(dateStr) {
    const days = daysUntil(dateStr);
    if (days === null)
        return { text: '—', color: 'var(--text-muted)' };
    let text, color;
    if (days < 0) {
        text = `متأخر ${Math.abs(days)} يوم`;
        color = 'var(--danger,#e74c3c)';
    } else if (days === 0) {
        text = 'اليوم';
        color = 'var(--danger,#e74c3c)';
    } else if (days <= 3) {
        text = `باقي ${days} يوم`;
        color = 'var(--danger,#e74c3c)';
    } else {
        text = `باقي ${days} يوم`;
        color = 'var(--success,#27ae60)';
    }
    return { text, color };
}

function renderShippingDates(list) {
    const tbody = document.getElementById('shippingTableBody');
    const empty = document.getElementById('shippingEmpty');
    // الأقرب ميعاد يطلع فوق، اللي مفيش ليه ميعاد يطلع آخر القائمة
    const sorted = [...list].sort((a,b)=>{
        if (!a.ShippingDate && !b.ShippingDate)
            return new Date(b.InvoiceDate) - new Date(a.InvoiceDate);
        if (!a.ShippingDate)
            return 1;
        if (!b.ShippingDate)
            return -1;
        return new Date(a.ShippingDate) - new Date(b.ShippingDate);
    });
    if (!sorted.length) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = sorted.map(inv=>{
        const info = shippingCountdownInfo(inv.ShippingDate);
        return `
    <tr>
      <td><strong>${inv.InvoiceNumber || inv.ID}</strong></td>
      <td>${fmtDate(inv.InvoiceDate)}</td>
      <td>${inv.CustomerName || '—'}</td>
      <td>${fmt(inv.GrandTotal)}</td>
      <td><input type="date" value="${inv.ShippingDate || ''}" onchange="setShippingDate('${inv.ID}', this.value)" style="border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:13px;background:var(--bg-card);color:var(--text-primary);font-family:inherit" /></td>
      <td><span style="font-weight:700;color:${info.color}">${info.text}</span></td>
    </tr>`;
    }
    ).join('');
}

async function setShippingDate(id, value) {
    try {
        await apiPost('updateInvoiceStatus', {
            id,
            data: {
                ShippingDate: value
            }
        });
        invalidateCache('invoices');
        const freshRes = await apiGet('getInvoices');
        cache.invoices = freshRes.data || [];
        state.invoices = cache.invoices;
        renderShippingDates(state.invoices);
        showToast(value ? 'تم تحديد ميعاد التحميل ✓' : 'تم إلغاء الميعاد');
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    }
}

function filterShippingDates() {
    const q = document.getElementById('shippingSearch').value.toLowerCase();
    const f = document.getElementById('shippingDateFilter').value;
    renderShippingDates(state.invoices.filter(i=>{
        const matchesQ = !q || (i.InvoiceNumber || '').toLowerCase().includes(q) || (i.CustomerName || '').toLowerCase().includes(q);
        const matchesF = !f || (f === 'set' ? !!i.ShippingDate : !i.ShippingDate);
        return matchesQ && matchesF;
    }
    ));
}

async function deleteInvoice(id, num) {
    confirmDelete(`هل تريد حذف الفاتورة "${num}"؟`, async()=>{
        try {
            await apiPost('deleteInvoice', {
                id
            });
            invalidateCache('invoices', 'commissions');
            showToast('تم حذف الفاتورة');
            await loadInvoices();
        } catch (err) {
            showToast('خطأ: ' + err.message, 'error');
        }
    }
    );
}

// ── DISCOUNT SMART PARSER ──
/**
 * يقرأ قيمة حقل الخصم بذكاء:
 * - لو فيها "%" (مثال: "10%" أو "10.5%") → خصم نسبة مئوية
 * - لو رقم عادي (مثال: "50" أو "100.5")  → خصم مبلغ ثابت
 * يرجع { isPercent, pct, value }
 */
function parseDiscountInput(rawVal, subtotal) {
    const str = String(rawVal || '0').trim();
    if (str.includes('%')) {
        const pct = Math.max(0, parseFloat(str) || 0);
        return { isPercent: true, pct, value: subtotal * pct / 100 };
    }
    const amount = Math.max(0, parseFloat(str) || 0);
    const pct = subtotal > 0 ? (amount / subtotal * 100) : 0;
    return { isPercent: false, pct, value: amount };
}

/** يحدّث الـ badge جنب الـ label الخصم */
function updateDiscountTag() {
    const tag = document.getElementById('discountTypeTag');
    if (!tag) return;
    const val = String(document.getElementById('invDiscount')?.value || '').trim();
    if (val.includes('%')) {
        const pct = parseFloat(val) || 0;
        if (pct > 0) {
            tag.textContent = 'نسبة ' + pct + '%';
            tag.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:4px;background:var(--accent-soft);color:var(--accent);font-weight:600;margin-right:6px';
        } else {
            tag.textContent = 'لا خصم';
            tag.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg-elevated);color:var(--text-muted);font-weight:600;margin-right:6px';
        }
    } else {
        const n = parseFloat(val) || 0;
        if (n > 0) {
            tag.textContent = 'مبلغ ثابت';
            tag.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:4px;background:var(--success-soft);color:var(--success);font-weight:600;margin-right:6px';
        } else {
            tag.textContent = 'لا خصم';
            tag.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg-elevated);color:var(--text-muted);font-weight:600;margin-right:6px';
        }
    }
}

// ── INVOICE CREATOR ──
const invItems = [];
let editingInvoiceId = null;

async function openInvoiceCreator() {
    editingInvoiceId = null;
    // force reload flavors دايماً عشان نضمن إنها محدّثة
    invalidateCache('flavors');
    try {
        const [customers,products,salesTeam,socialTeam,flavors] = await Promise.all([cached('customers', 'getCustomers'), cached('products', 'getProducts'), cached('salesTeam', 'getSalesTeam'), cached('socialTeam', 'getSocialTeam'), cached('flavors', 'getFlavors'), ]);
        state.customers = customers;
        state.products = products;
        state.salesTeam = salesTeam;
        state.socialTeam = socialTeam;
        state.flavors = flavors;
    } catch (err) {
        if (err.message === 'NO_API')
            return;
    }

    document.getElementById('invNumber').value = '';
    document.getElementById('invDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('invNotes').value = '';
    document.getElementById('invDiscount').value = '0';
    document.getElementById('invSalesRate').value = '0';
    document.getElementById('invSocialRate').value = '0';
    document.getElementById('invPortLoading').value = COMPANY.PortLoading || 'Alexandria Port, Egypt';
    document.getElementById('invPortDischarge').value = '';
    document.getElementById('invRunNumber').value = '';
    document.getElementById('invProductionOrderDate').value = '';
    document.getElementById('invProductionMonth').value = '';
    document.getElementById('invExpiry').value = '';
    document.getElementById('invProductionNotes').value = '';
    document.getElementById('invPurchasingNotes').value = '';
    document.getElementById('invManufacturingNotes').value = '';
    invItems.length = 0;
    renderInvoiceItems();

    document.getElementById('invCustomer').innerHTML = '<option value="">اختر العميل</option>' + state.customers.map(c=>`<option value="${c.ID}" data-name="${c.CompanyName}" data-country="${c.Country || ''}" data-phone="${c.Phone || ''}" data-email="${c.Email || ''}" data-website="${c.Website || ''}" data-address="${c.Address || ''}">${c.CompanyName}</option>`).join('');

    document.getElementById('invSalesRep').innerHTML = '<option value="">-- لا يوجد --</option>' + state.salesTeam.map(m=>`<option value="${m.ID}" data-rate="${m.CommissionPercent}" data-name="${m.EmployeeName}">${m.EmployeeName} (${m.CommissionPercent}%)</option>`).join('');

    document.getElementById('invSocialRep').innerHTML = '<option value="">-- لا يوجد --</option>' + state.socialTeam.map(m=>`<option value="${m.ID}" data-rate="${m.CommissionPercent}" data-name="${m.EmployeeName}">${m.EmployeeName} (${m.CommissionPercent}%)</option>`).join('');

    addInvoiceItem();
    recalculate();
    openModal('invoiceCreatorModal');
}

function addInvoiceItem() {
    invItems.push({
        ProductID: '',
        ProductName: '',
        PackSize: '',
        UnitsPerCarton: '',
        Quantity: 1,
        UnitPrice: 0,
        CartonQty: 0,
        LineTotal: 0,
        Flavors: [],
        FlavorNames: []
    });
    renderInvoiceItems();
}

function toggleFlavor(idx, flavorId, flavorEn, flavorAr, checkbox) {
    if (!invItems[idx].Flavors)
        invItems[idx].Flavors = [];
    if (!invItems[idx].FlavorNames)
        invItems[idx].FlavorNames = [];
    if (checkbox.checked) {
        invItems[idx].Flavors.push(flavorId);
        invItems[idx].FlavorNames.push({
            id: flavorId,
            en: flavorEn,
            ar: flavorAr
        });
    } else {
        invItems[idx].Flavors = invItems[idx].Flavors.filter(f=>f !== flavorId);
        invItems[idx].FlavorNames = invItems[idx].FlavorNames.filter(f=>f.id !== flavorId);
    }
    renderInvoiceItems();
}

function removeInvoiceItem(idx) {
    invItems.splice(idx, 1);
    renderInvoiceItems();
    recalculate();
}

function renderInvoiceItems() {
    const container = document.getElementById('invoiceItemsList');
    if (!invItems.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">لا توجد منتجات — اضغط "إضافة منتج"</p>';
        return;
    }
    container.innerHTML = invItems.map((item,idx)=>{
        const productFlavors = item.ProductID ? getFlavorsForProduct(item.ProductID) : [];
        const selectedFlavors = item.Flavors || [];
        const flavorsHtml = productFlavors.length ? `
      <div class="form-group flavor-picker" style="grid-column:1/-1">
        <label><i class="fas fa-pepper-hot" style="color:#e74c3c;margin-left:4px"></i> النكهات</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:var(--bg-base);border:1px solid var(--border);border-radius:var(--radius-sm)">
          ${productFlavors.map(f=>`
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;border-radius:4px;border:1px solid var(--border);background:${selectedFlavors.map(String).includes(String(f.ID)) ? 'var(--accent)' : 'var(--bg-card)'};color:${selectedFlavors.map(String).includes(String(f.ID)) ? '#fff' : 'inherit'}">
              <input type="checkbox" style="display:none" ${selectedFlavors.map(String).includes(String(f.ID)) ? 'checked' : ''} onchange="toggleFlavor(${idx},'${f.ID}','${f.FlavorName}','${f.FlavorNameAr || ''}',this)">
              ${f.FlavorName}${f.FlavorNameAr ? ' / ' + f.FlavorNameAr : ''}
            </label>`).join('')}
        </div>
      </div>` : (item.ProductID ? '<div class="form-group" style="grid-column:1/-1"><small style="color:var(--text-muted)"><i class="fas fa-info-circle"></i> لا توجد نكهات — أضفها من صفحة المنتجات</small></div>' : '');
        return `
    <div class="invoice-item-row">
      <div class="form-group">
        <label>المنتج</label>
        <select onchange="onProductSelect(${idx},this)">
          <option value="">اختر منتجاً</option>
          ${state.products.filter(p=>p.Status !== 'Inactive').map(p=>`<option value="${p.ID}" data-price="${p.PricePerCarton}" data-name="${p.ProductName}" data-size="${p.Size || ''}" data-units="${p.UnitsPerCarton || ''}"
              ${String(item.ProductID) === String(p.ID) ? 'selected' : ''}>${p.ProductName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>الكمية (كرتون)</label>
        <input type="number" min="0" value="${item.CartonQty || item.Quantity}" oninput="updateItem(${idx},'CartonQty',this.value)" />
      </div>
      <div class="form-group">
        <label>سعر الكرتون</label>
        <input type="number" min="0" step="0.01" value="${item.UnitPrice}" oninput="updateItem(${idx},'UnitPrice',this.value)" />
      </div>
      <div class="form-group">
        <label>الإجمالي</label>
        <div class="item-line-total" style="padding:9px 12px;background:var(--bg-base);border:1px solid var(--border);border-radius:var(--radius-sm);font-weight:700;color:var(--accent)">${fmtNum(item.LineTotal)}</div>
      </div>
      <div>
        <button type="button" class="item-remove" onclick="removeInvoiceItem(${idx})"><i class="fas fa-xmark"></i></button>
      </div>
      ${flavorsHtml}
    </div>`;
    }
    ).join('');
}

function onProductSelect(idx, sel) {
    const opt = sel.options[sel.selectedIndex];
    invItems[idx].ProductID = sel.value;
    invItems[idx].ProductName = opt.dataset.name || '';
    invItems[idx].PackSize = opt.dataset.size || '';
    invItems[idx].UnitsPerCarton = opt.dataset.units || '';
    invItems[idx].UnitPrice = parseFloat(opt.dataset.price) || 0;
    invItems[idx].CartonQty = invItems[idx].CartonQty || 1;
    invItems[idx].Quantity = invItems[idx].CartonQty;
    invItems[idx].LineTotal = invItems[idx].CartonQty * invItems[idx].UnitPrice;
    invItems[idx].Flavors = [];
    invItems[idx].FlavorNames = [];
    renderInvoiceItems();
    recalculate();
}

function updateItem(idx, field, val) {
    invItems[idx][field] = parseFloat(val) || 0;
    if (field === 'CartonQty')
        invItems[idx].Quantity = invItems[idx].CartonQty;
    invItems[idx].LineTotal = invItems[idx].CartonQty * invItems[idx].UnitPrice;
    // تحديث الإجمالي في الـ DOM مباشرة بدون re-render عشان نحافظ على الـ focus
    const row = document.querySelectorAll('#invoiceItemsList .invoice-item-row')[idx];
    if (row) {
        const totalEl = row.querySelector('.item-line-total');
        if (totalEl)
            totalEl.textContent = fmtNum(invItems[idx].LineTotal);
    }
    recalculate();
}

function onCustomerChange() {
    const sel = document.getElementById('invCustomer');
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.dataset.country) {
        const country = opt.dataset.country;
        const portEl = document.getElementById('invPortDischarge');
        if (!portEl.value)
            portEl.value = country ? country + ' Port' : '';
    }
}

function recalculate() {
    const subtotal = invItems.reduce((s,i)=>s + i.LineTotal, 0);
    const disc = parseDiscountInput(document.getElementById('invDiscount').value, subtotal);
    const afterDisc = subtotal - disc.value;
    const salesRate = parseFloat(document.getElementById('invSalesRate')?.value) || 0;
    const socialRate = parseFloat(document.getElementById('invSocialRate')?.value) || 0;
    document.getElementById('sumSubtotal').textContent = fmtNum(subtotal);
    document.getElementById('sumDiscountVal').textContent = fmtNum(disc.value);
    document.getElementById('sumAfterDiscount').textContent = fmtNum(afterDisc);
    document.getElementById('sumSalesComm').textContent = fmtNum(afterDisc * salesRate / 100);
    document.getElementById('sumSocialComm').textContent = fmtNum(afterDisc * socialRate / 100);
    document.getElementById('sumGrandTotal').textContent = fmtNum(afterDisc);
    updateDiscountTag();
}

async function saveInvoice(status) {
    const customerSel = document.getElementById('invCustomer');
    const salesSel = document.getElementById('invSalesRep');
    const socialSel = document.getElementById('invSocialRep');
    if (!customerSel.value) {
        showToast('يرجى اختيار العميل', 'warning');
        return;
    }
    if (!invItems.length || invItems.every(i=>!i.ProductID)) {
        showToast('يرجى إضافة منتج واحد على الأقل', 'warning');
        return;
    }

    const subtotal = invItems.reduce((s,i)=>s + i.LineTotal, 0);
    const disc = parseDiscountInput(document.getElementById('invDiscount').value, subtotal);
    const discPct = disc.pct;
    const discVal = disc.value;
    const afterDisc = subtotal - discVal;
    const salesRate = parseFloat(document.getElementById('invSalesRate')?.value) || 0;
    const socialRate = parseFloat(document.getElementById('invSocialRate')?.value) || 0;

    const data = {
        InvoiceNumber: document.getElementById('invNumber').value.trim() || autoInvoiceNum(),
        InvoiceDate: document.getElementById('invDate').value,
        CustomerID: customerSel.value,
        CustomerName: customerSel.options[customerSel.selectedIndex].dataset.name || customerSel.options[customerSel.selectedIndex].text,
        SalesRepID: salesSel.value,
        SalesRepName: salesSel.options[salesSel.selectedIndex]?.dataset.name || '',
        SocialRepID: socialSel.value,
        SocialRepName: socialSel.options[socialSel.selectedIndex]?.dataset.name || '',
        Subtotal: subtotal,
        DiscountRaw: document.getElementById('invDiscount').value.trim(),
        DiscountPercent: discPct,
        DiscountValue: discVal,
        TotalAfterDiscount: afterDisc,
        SalesCommissionRate: salesRate,
        SalesCommission: afterDisc * salesRate / 100,
        SocialCommissionRate: socialRate,
        SocialCommission: afterDisc * socialRate / 100,
        GrandTotal: afterDisc,
        PortOfLoading: document.getElementById('invPortLoading').value.trim(),
        PortOfDischarge: document.getElementById('invPortDischarge').value.trim(),
        Notes: document.getElementById('invNotes').value.trim(),
        RunNumber: document.getElementById('invRunNumber').value.trim(),
        ProductionOrderDate: document.getElementById('invProductionOrderDate').value.trim(),
        ProductionMonth: document.getElementById('invProductionMonth').value.trim(),
        Expiry: document.getElementById('invExpiry').value.trim(),
        ProductionNotes: document.getElementById('invProductionNotes').value.trim(),
        PurchasingNotes: document.getElementById('invPurchasingNotes').value.trim(),
        ManufacturingNotes: document.getElementById('invManufacturingNotes').value.trim(),
        Status: status,
        HealthCert: 'لم يتم',
        Items: invItems.filter(i=>i.ProductID).map(i=>({
            ...i
        })),
    };

    try {
        if (editingInvoiceId) {
            await apiPost('updateInvoice', {
                id: editingInvoiceId,
                data
            });
            invalidateCache('invoices', 'commissions');
            showToast('تم تحديث الفاتورة بنجاح ✓');
        } else {
            await apiPost('saveInvoice', {
                data
            });
            invalidateCache('invoices', 'commissions');
            showToast('تم حفظ الفاتورة بنجاح ✓');
        }
        editingInvoiceId = null;
        closeModal('invoiceCreatorModal');
        await loadInvoices();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    }
}

async function changeInvoiceStatus(id, newStatus) {
    try {
        await apiPost('updateInvoiceStatus', {
            id,
            data: {
                Status: newStatus
            }
        });
        invalidateCache('invoices');
        const labels = {
            Draft: 'مسودة',
            Confirmed: 'مؤكدة',
            Paid: 'مدفوعة ✓'
        };
        showToast('تم تغيير الحالة إلى: ' + (labels[newStatus] || newStatus));
        await loadInvoices();
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
    }
}

async function editInvoice(id) {
    // force reload flavors عشان تظهر صح
    invalidateCache('flavors');
    try {
        const inv = state.invoices.find(i=>i.ID === id);
        if (!inv)
            return;
        const [customers,products,salesTeam,socialTeam,flavors,items] = await Promise.all([cached('customers', 'getCustomers'), cached('products', 'getProducts'), cached('salesTeam', 'getSalesTeam'), cached('socialTeam', 'getSocialTeam'), cached('flavors', 'getFlavors'), cachedInvoiceItems(id), ]);
        state.customers = customers;
        state.products = products;
        state.salesTeam = salesTeam;
        state.socialTeam = socialTeam;
        state.flavors = flavors;

        editingInvoiceId = id;
        invItems.length = 0;
        (items || []).forEach(item=>{
            let parsedFlavors = [];
            try {
                parsedFlavors = JSON.parse(item.Flavors || '[]');
            } catch {}
            if (!Array.isArray(parsedFlavors))
                parsedFlavors = [];
            // Flavors = array of IDs (strings), FlavorNames = array of objects {id, en, ar}
            const flavorIds = parsedFlavors.map(f=>(typeof f === 'object' ? f.id : f)).filter(Boolean);
            const flavorNames = parsedFlavors.map(f=>typeof f === 'object' ? f : {
                id: f,
                en: f,
                ar: ''
            }).filter(f=>f.id);
            invItems.push({
                ProductID: item.ProductID,
                ProductName: item.ProductName,
                PackSize: item.PackSize || '',
                UnitsPerCarton: item.UnitsPerCarton || '',
                Quantity: parseFloat(item.Quantity) || 0,
                UnitPrice: parseFloat(item.UnitPrice) || 0,
                CartonQty: parseFloat(item.CartonQty) || parseFloat(item.Quantity) || 0,
                LineTotal: parseFloat(item.LineTotal) || 0,
                Flavors: flavorIds,
                FlavorNames: flavorNames
            });
        }
        );
        if (!invItems.length)
            invItems.push({
                ProductID: '',
                ProductName: '',
                PackSize: '',
                UnitsPerCarton: '',
                Quantity: 1,
                UnitPrice: 0,
                CartonQty: 0,
                LineTotal: 0,
                Flavors: [],
                FlavorNames: []
            });

        // Populate form fields
        openModal('invoiceCreatorModal');
        // wait for modal to render
        await new Promise(r=>setTimeout(r, 50));
        document.getElementById('invCustomer').innerHTML = '<option value="">اختر العميل</option>' + state.customers.map(c=>`<option value="${c.ID}" ${c.ID === inv.CustomerID ? 'selected' : ''}>${c.CompanyName}</option>`).join('');
        document.getElementById('invSalesRep').innerHTML = '<option value="">-- لا يوجد --</option>' + state.salesTeam.map(s=>`<option value="${s.ID}" ${s.ID === inv.SalesRepID ? 'selected' : ''}>${s.EmployeeName}</option>`).join('');
        document.getElementById('invSocialRep').innerHTML = '<option value="">-- لا يوجد --</option>' + state.socialTeam.map(s=>`<option value="${s.ID}" ${s.ID === inv.SocialRepID ? 'selected' : ''}>${s.EmployeeName}</option>`).join('');
        document.getElementById('invNumber').value = inv.InvoiceNumber || '';
        document.getElementById('invDate').value = inv.InvoiceDate ? inv.InvoiceDate.split('T')[0] : '';
        document.getElementById('invCustomer').value = inv.CustomerID || '';
        document.getElementById('invSalesRep').value = inv.SalesRepID || '';
        document.getElementById('invSocialRep').value = inv.SocialRepID || '';
        document.getElementById('invDiscount').value = inv.DiscountRaw || (inv.DiscountPercent > 0 ? inv.DiscountPercent + '%' : '0');
        document.getElementById('invSalesRate').value = inv.SalesCommissionRate || '0';
        document.getElementById('invSocialRate').value = inv.SocialCommissionRate || '0';
        document.getElementById('invPortLoading').value = inv.PortOfLoading || '';
        document.getElementById('invPortDischarge').value = inv.PortOfDischarge || '';
        document.getElementById('invNotes').value = inv.Notes || '';
        document.getElementById('invRunNumber').value = inv.RunNumber || '';
        document.getElementById('invProductionOrderDate').value = inv.ProductionOrderDate || '';
        document.getElementById('invProductionMonth').value = inv.ProductionMonth || '';
        document.getElementById('invExpiry').value = inv.Expiry || '';
        document.getElementById('invProductionNotes').value = inv.ProductionNotes || '';
        document.getElementById('invPurchasingNotes').value = inv.PurchasingNotes || '';
        document.getElementById('invManufacturingNotes').value = inv.ManufacturingNotes || '';
        renderInvoiceItems();
        recalculate();
    } catch (err) {
        showToast('خطأ في تحميل الفاتورة: ' + err.message, 'error');
    }
}

function autoInvoiceNum() {
    const n = parseInt(localStorage.getItem('egygulf_inv_counter') || '1000') + 1;
    localStorage.setItem('egygulf_inv_counter', n);
    return 'INV-' + n;
}

// ── INVOICE PREVIEW / PRINT ──
async function viewInvoice(id) {
    const inv = state.invoices.find(i=>i.ID === id);
    if (!inv)
        return;
    try {
        const items = await cachedInvoiceItems(id);
        const customer = state.customers.find(c=>c.ID === inv.CustomerID) || {};
        renderInvoicePrint(inv, items, customer);
        openModal('invoicePreviewModal');
    } catch (err) {
        showToast('خطأ في تحميل تفاصيل الفاتورة', 'error');
    }
}

async function printInvoiceDirect(id) {
    const inv = state.invoices.find(i=>i.ID === id);
    if (!inv)
        return;
    try {
        const itemsRes = {
            data: await cachedInvoiceItems(id)
        };
        const customer = state.customers.find(c=>c.ID === inv.CustomerID) || {};
        const comp = COMPANY;
        const compName = comp.CompanyName || 'Egyptian Gulf International';
        const compNameAr = comp.CompanyNameAr || 'الشركة المصرية الخليجية الدولية للصناعات والأغذية الخفيفة';
        const compEmail = comp.CompanyEmail || 'export@egygulf-foods.com';
        const compWebsite = comp.CompanyWebsite || 'www.egygulf-foods.com';
        const compAddress = comp.CompanyAddress || 'Cairo – Alexandria Agricultural Road, Km 90, Tanta, Egypt';
        const portLoad = inv.PortOfLoading || comp.PortLoading || 'Alexandria Port, Egypt';
        const portDisc = inv.PortOfDischarge || (customer.Country ? customer.Country + ' Port' : '—');
        const runNumber = inv.RunNumber || '—';
        const prodMonth = inv.ProductionMonth ? (()=>{
            const d = new Date(inv.ProductionMonth + '-01');
            return d.toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'long'
            });
        }
        )() : '—';
        const expiry = inv.Expiry || '—';
        const prodNotes = inv.ProductionNotes || '';
        const currency = CURRENCY || 'USD';
        const items = itemsRes.data || [];
        const totalCartons = items.reduce((s,i)=>s + (parseFloat(i.CartonQty) || parseFloat(i.Quantity) || 0), 0);

        const itemsHtml = items.map((item,i)=>{
            let flavorNames = [];
            try {
                const f = JSON.parse(item.Flavors || '[]');
                flavorNames = f.map(x=>typeof x === 'object' ? (x.en + (x.ar ? ' / ' + x.ar : '')) : x).filter(Boolean);
            } catch {}
            const flavorsStr = flavorNames.length ? `<div style="font-size:8pt;color:#c0392b;margin-top:3px">🌶 ${flavorNames.join(' • ')}</div>` : '';
            return `<tr>
        <td style="text-align:center;font-weight:600">${i + 1}</td>
        <td class="desc-cell">${item.ProductName || '—'}${flavorsStr}</td>
        <td>${item.PackSize || item.Size || '—'}</td>
        <td>${item.UnitsPerCarton || '—'}</td>
        <td style="font-weight:700">${(parseFloat(item.CartonQty) || parseFloat(item.Quantity) || 0).toLocaleString('en-US')}</td>
        <td>$${fmtNum(item.UnitPrice)}</td>
        <td style="font-weight:700">$${fmtNum(item.LineTotal)}</td>
      </tr>`;
        }
        ).join('');

        const invoiceHtml = `<!DOCTYPE html><html dir="ltr"><head>
      <meta charset="UTF-8">
      <title>Invoice ${inv.InvoiceNumber || inv.ID}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Cairo',Arial,sans-serif;background:#fff;padding:20px}
        .commercial-invoice {
    background: #ffffff;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 8mm 10mm;
    font-family: 'Cairo', Arial, sans-serif;
    font-size: 10pt;
    color: #111;
    direction: ltr;
    box-shadow: 0 2px 20px rgba(0, 0, 0, 0.15);
}


/* ══════════════════════════════
   HEADER — top address bar
══════════════════════════════ */

.ci-top-address {
    font-size: 7.5pt;
    color: #333;
    padding: 4px 0 6px 0;
    line-height: 1.6;
    border-bottom: none;
}

.ci-header-left { display: contents; }

.ci-top-address strong {
    font-weight: 700;
}


/* ── Main Header Box ── */

.ci-header {
    display: grid;
    grid-template-columns: 130px 1fr 200px;
    align-items: stretch;
    border: 1.5px solid #222;
    margin-bottom: 0;
    min-height: 90px;
}

.ci-header-logo {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid #ddd;
}

.ci-logo-svg {
    width: 80px;
    height: 55px;
}

.ci-header-company {
    flex: 1;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.ci-company-en {
    font-size: 13pt;
    font-weight: 900;
    color: #111;
    line-height: 1.2;
}

.ci-company-en-sub {
    font-size: 9.5pt;
    font-weight: 600;
    color: #333;
    line-height: 1.3;
}

.ci-company-ar {
    font-size: 8.5pt;
    color: #555;
    direction: rtl;
    text-align: right;
    line-height: 1.4;
    margin-top: 3px;
}

.ci-company-contact {
    margin-top: 5px;
    font-size: 7.5pt;
    color: #444;
    line-height: 1.7;
}


/* right panel — company name repeated + invoice number */

.ci-header-right {
    min-width: 200px;
    border-left: 1.5px solid #222;
    display: flex;
    flex-direction: column;
}

.ci-header-right-top {
    flex: 1;
    padding: 10px 12px;
    border-bottom: 1px solid #ddd;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.ci-header-right-name {
    font-size: 10.5pt;
    font-weight: 900;
    color: #111;
    line-height: 1.25;
}

.ci-header-right-sub {
    font-size: 8pt;
    color: #555;
    line-height: 1.3;
}

.ci-header-right-ar {
    font-size: 8pt;
    color: #777;
    direction: rtl;
    text-align: right;
    line-height: 1.3;
}

.ci-header-right-bottom {
    padding: 8px 12px;
}

.ci-inv-details {
    width: 100%;
    border-collapse: collapse;
}

.ci-inv-details td {
    padding: 2px 0;
    font-size: 9pt;
    vertical-align: top;
}

.ci-inv-label {
    color: #555;
    white-space: nowrap;
    padding-right: 8px;
    font-weight: 600;
    font-size: 8.5pt;
}

.ci-inv-value {
    font-weight: 900;
    color: #111;
    font-size: 10pt;
}


/* ── Title Bar ── */

.ci-title-bar {
    background: #e8522a;
    color: #fff;
    text-align: center;
    padding: 7px 10px;
    font-size: 12pt;
    font-weight: 800;
    letter-spacing: 1px;
    border: 1.5px solid #222;
    border-top: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}

.ci-title-ar {
    font-size: 12pt;
}

.ci-title-sep {
    opacity: 0.7;
    font-size: 14pt;
}

.ci-title-en {
    font-size: 12pt;
    letter-spacing: 2px;
}


/* ── Customer Info Grid ── */

.ci-customer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border: 1.5px solid #222;
    border-top: none;
}


/* row 1: website | country | phone */


/* row 2: company name (spans?) | address | email */

.ci-customer-cell {
    padding: 5px 10px;
    border-left: 1px solid #bbb;
    min-height: 44px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}

.ci-customer-cell:nth-child(1),
.ci-customer-cell:nth-child(4) {
    border-left: none;
}

.ci-customer-row-border {
    border-top: 1px solid #bbb;
}

.ci-cell-label {
    font-size: 7pt;
    font-weight: 800;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    gap: 3px;
    flex-wrap: wrap;
}

.ci-cell-label .ar {
    font-weight: 600;
    color: #666;
    direction: rtl;
    font-size: 7pt;
    font-style: normal;
    text-transform: none;
    letter-spacing: 0;
}

.ci-cell-value {
    font-size: 9.5pt;
    font-weight: 700;
    color: #111;
    word-break: break-word;
}


/* ── Products Table ── */

.ci-products-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid #222;
    border-top: none;
    margin-bottom: 0;
}

.ci-products-table th {
    background: #1c2340;
    color: #ffffff;
    padding: 7px 8px;
    font-size: 8pt;
    font-weight: 700;
    text-align: center;
    border: 1px solid #2d3555;
    vertical-align: middle;
    line-height: 1.35;
}

.ci-products-table th .ar-th {
    display: block;
    font-size: 7pt;
    color: #aab;
    font-weight: 400;
    direction: rtl;
    margin-top: 1px;
}

.ci-products-table td {
    padding: 6px 8px;
    font-size: 9pt;
    text-align: center;
    border: 1px solid #ddd;
    vertical-align: middle;
    color: #111;
}

.ci-products-table td.desc-cell {
    text-align: left;
    font-weight: 600;
    line-height: 1.4;
}

.ci-products-table tbody tr:nth-child(even) {
    background: #f7f7f7;
}

.ci-products-table tbody tr:nth-child(odd) {
    background: #ffffff;
}


/* tfoot — total row */

.ci-products-table tfoot tr {
    background: #f2f2f2;
}

.ci-products-table tfoot td {
    font-weight: 700;
    font-size: 9pt;
    border: 1.5px solid #aaa;
    padding: 7px 8px;
}

.ci-total-label-cell {
    text-align: center;
    font-size: 8.5pt;
    font-weight: 800;
    direction: ltr;
}

.ci-total-label-cell .ar-total {
    font-size: 8pt;
    color: #555;
    direction: rtl;
    font-weight: 600;
}

.ci-total-qty {
    font-size: 10pt;
    font-weight: 900;
    text-align: center;
}

.ci-total-value-header {
    font-size: 8pt;
    font-weight: 700;
    line-height: 1.4;
    text-align: center;
    background: #e8e8e8;
}

.ci-grand-total {
    font-size: 12pt;
    font-weight: 900;
    color: #111;
    text-align: center;
    background: #e8e8e8;
}


/* ── Ports ── */

.ci-ports {
    display: flex;
    justify-content: space-between;
    padding: 7px 12px;
    border: 1.5px solid #222;
    border-top: none;
    background: #ffffff;
    font-size: 9pt;
    font-weight: 500;
    gap: 20px;
}

.ci-ports div {
    flex: 1;
}

.ci-ports div:last-child {
    text-align: right;
}


/* ── Payment Terms ── */

.ci-terms {
    border: 1.5px solid #222;
    border-top: none;
    margin-bottom: 0;
}

.ci-terms-title {
    background: #1c2340;
    color: #fff;
    text-align: center;
    padding: 7px 10px;
    font-size: 9pt;
    font-weight: 800;
    letter-spacing: 0.5px;
    direction: ltr;
    border-bottom: 1px solid #2d3555;
}

.ci-terms-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
}

.ci-terms-section {
    padding: 8px 12px;
    border-bottom: 1px solid #e0e0e0;
    border-left: 1px solid #e0e0e0;
    font-size: 8pt;
    line-height: 1.65;
}

.ci-terms-section:nth-child(odd) {
    border-left: none;
}

.ci-terms-section-title {
    font-size: 8pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 5px;
    color: #c0392b;
}

.ci-terms-section.ci-terms-ar {
    direction: rtl;
    text-align: right;
}

.ci-terms-section.ci-terms-ar .ci-terms-section-title {
    color: #c0392b;
    text-transform: none;
    letter-spacing: 0;
}

.ci-terms-section ul {
    list-style: disc;
    padding-right: 0;
    padding-left: 16px;
    color: #333;
    margin: 0;
}

.ci-terms-section.ci-terms-ar ul {
    padding-left: 0;
    padding-right: 16px;
}

.ci-terms-section p,
.ci-terms-section li {
    color: #444;
    margin-bottom: 2px;
    font-size: 8pt;
}


/* ── Footer Notes ── */

.ci-footer-notes {
    border: 1.5px solid #222;
    border-top: none;
    padding: 7px 12px;
    font-size: 7.5pt;
    color: #333;
    text-align: center;
    line-height: 1.9;
    background: #fff;
    font-weight: 500;
}

.ci-footer-notes div {
    padding: 1px 0;
    border-bottom: 1px dashed #ddd;
}

.ci-footer-notes div:last-child {
    border-bottom: none;
}


/* ════════════════════════════════
   EMPTY STATE
════════════════════════════════ */

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--text-muted);
    gap: 16px;
}

.empty-state i {
    font-size: 48px;
    opacity: .4;
}

.empty-state p {
    font-size: 15px;
}


/* ════════════════════════════════
   SKELETON / LOADING
════════════════════════════════ */

.skeleton {
    background: linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-card) 50%, var(--bg-elevated) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 6px;
    height: 20px;
}

@keyframes shimmer {
    0% {
        background-position: 200% 0
    }
    100% {
        background-position: -200% 0
    }
}

.loading-row td {
    padding: 16px;
}


/* ════════════════════════════════
   TOAST
════════════════════════════════ */

.toast-container {
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    font-size: 14px;
    min-width: 280px;
    animation: slideIn .3s ease;
}

.toast.success {
    border-color: var(--success);
}

.toast.success i {
    color: var(--success);
}

.toast.error {
    border-color: var(--danger);
}

.toast.error i {
    color: var(--danger);
}

.toast.warning {
    border-color: var(--warning);
}

.toast.warning i {
    color: var(--warning);
}

.toast.fade-out {
    animation: slideOut .3s ease forwards;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateX(-20px)
    }
    to {
        opacity: 1;
        transform: translateX(0)
    }
}

@keyframes slideOut {
    from {
        opacity: 1;
        transform: translateX(0)
    }
    to {
        opacity: 0;
        transform: translateX(-20px)
    }
}


/* ════════════════════════════════
   CONFIRM ICON
════════════════════════════════ */

.confirm-icon {
    font-size: 48px;
    color: var(--warning);
    margin-bottom: 12px;
}

#confirmMessage {
    font-size: 15px;
    color: var(--text-secondary);
}


/* ════════════════════════════════
   API BANNER
════════════════════════════════ */

.api-banner {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--warning-soft);
    border: 1px solid var(--warning);
    border-radius: var(--radius-sm);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: var(--warning);
    z-index: 500;
}

.api-banner button {
    background: var(--warning);

        @media print{body{padding:0}@page{margin:10mm}}
      </style>
    </head><body>
      <div class="commercial-invoice">
        <div class="ci-top-address">
          <strong>Address:</strong> ${compAddress} &nbsp;&nbsp;
          <strong>website:</strong> ${compWebsite} &nbsp;&nbsp;
          <strong>EMail:</strong> ${compEmail}
        </div>
        <div class="ci-header">
          <div class="ci-header-logo">
            <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIbGNtcwIQAABtbnRyUkdCIFhZWiAH4gADABQACQAOAB1hY3NwTVNGVAAAAABzYXdzY3RybAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWhhbmSdkQA9QICwPUB0LIGepSKOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAABxjcHJ0AAABDAAAAAx3dHB0AAABGAAAABRyWFlaAAABLAAAABRnWFlaAAABQAAAABRiWFlaAAABVAAAABRyVFJDAAABaAAAAGBnVFJDAAABaAAAAGBiVFJDAAABaAAAAGBkZXNjAAAAAAAAAAV1UkdCAAAAAAAAAAAAAAAAdGV4dAAAAABDQzAAWFlaIAAAAAAAAPNUAAEAAAABFslYWVogAAAAAAAAb6AAADjyAAADj1hZWiAAAAAAAABilgAAt4kAABjaWFlaIAAAAAAAACSgAAAPhQAAtsRjdXJ2AAAAAAAAACoAAAB8APgBnAJ1A4MEyQZOCBIKGAxiDvQRzxT2GGocLiBDJKwpai5+M+s5sz/WRldNNlR2XBdkHWyGdVZ+jYgskjacq6eMstu+mcrH12Xkd/H5////2wBDAAkGBwgHBgkICAgKCgkLDhcPDg0NDhwUFREXIh4jIyEeICAlKjUtJScyKCAgLj8vMjc5PDw8JC1CRkE6RjU7PDn/2wBDAQoKCg4MDhsPDxs5JiAmOTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTn/wAARCAYkBiADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3GiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoo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/wCtXSXumW92Msu1/wC8vB/H1rMk8POPuTAj0Ir5eeVYrDzvRenkeosXSqq00VZtZu5F25VM9So5rPJLkkkknkk8k1sL4fmJ5mQD2BNXLXQoIyGlYyEdjwPyqXl+OxLXtL29Q+sUKa9wytK057uQMykQg8npn2FdUihF2gcCkRFRcKAAOOKd2r6PA4GGEhZbvdnnV6zqyu9hroHQqwBBGOa5XVNOe0kJVSYSeD1x7GutpjorqQwyDwciljsDDFws9+jChXdF3Wxw6sUIKkgg5BBwRWjFrV4ihSyPjuRz+laVzoUEhLROYye3UVTPh+YHiZCPcEV86sBjsM2qd7HpOvh6qvIo3d/cXfEj/L2UcD/69VlDMQACSeAByTW3H4ebIMk4+gFadnptvaDKLlu7Hk1UMqxWInzVn95LxdKmrQRW0TTjbL50o/esPyHpWtSUtfUYfDwoQVOOx5dSbqScmZus2P2yDcg/epkr7+1csylSQQQQcEHgiu7rPvdLgu/mYbX/ALw6/j615WZ5X9Y/eU9JfmdeGxXsvdlscxb3E1u26KQqfbofwq1JrF66bfMC9iQADVtvD8uTtmUj3BzT4fD3QyzZHoox+teTSwWYR9yN0vwOuVfDv3nZv0Mm2gmvJtq5LHksecD1NQuCrFT1Bwa7O1tYrWPy4lAHf3rMvtE86ZpYXC7jkgjjNbYjJaipJx1l1Ip42Lm09F0KnhsE3rntsP8AMV0rAEYNUdM09bFGydzt1OKv17mXYeVCgoT3OHEVFUqOS2OO1Gze0nIKnyycqe2PSoLe4kt5BJG2GH612c0Mc6FJFDKeoNZU+gRMcxSMg9OorxsVk9WFT2lB+Z2UsZBx5aiII/EDgAPCCe5BxUN3rc06FUURgjBOcmpG8PzD7syEe4Ip0fh6Qn55xj2FS45nNcjvYaeFTuYnWul0GyMEbTSLh36A9QKms9JtrZg+C7joW5x9K0RiuzLcpdCftar1McTi1UXLHYWiiivfOEKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigApjxpIu11DD0IzT6KAKEmjaXLkyadaPn+9Cp/pSRaNpUPMWm2aH/AGYFH8hWhRRzPuBHHDFH9yNE+gAqSiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z" style="width:110px;height:auto;display:block">
          </div>
          <div class="ci-header-company">
            <div class="ci-company-en">${compName}</div>
            <div class="ci-company-en-sub">For Snacks &amp; Food Industries</div>
            <div class="ci-company-ar">${compNameAr}</div>
          </div>
          <div class="ci-header-right">
            <div class="ci-header-right-top">
              <div class="ci-header-right-name">${compName}</div>
              <div class="ci-header-right-name">For Snacks &amp; Food Industries</div>
              <div class="ci-header-right-sub">للصناعات والأغذية الخفيفة</div>
            </div>
            <div class="ci-header-right-bottom">
              <table class="ci-inv-details">
                <tr><td class="ci-inv-label">INVOICE NO:</td><td class="ci-inv-value">${inv.InvoiceNumber || inv.ID || '—'}</td></tr>
                <tr><td class="ci-inv-label">INVOICE DATE:</td><td class="ci-inv-value">${fmtDate(inv.InvoiceDate)}</td></tr>
              </table>
            </div>
          </div>
        </div>
        <div class="ci-title-bar">
          <span class="ci-title-ar">فاتورة تجارية</span>
          <span class="ci-title-sep">—</span>
          <span class="ci-title-en">COMMERCIAL INVOICE</span>
        </div>
        <div class="ci-customer-grid">
          <div class="ci-customer-cell"><div class="ci-cell-label">WEBSITE / <span class="ar">الموقع</span></div><div class="ci-cell-value">${customer.Website || '—'}</div></div>
          <div class="ci-customer-cell"><div class="ci-cell-label">COUNTRY / <span class="ar">البلد</span></div><div class="ci-cell-value">${customer.Country || '—'}</div></div>
          <div class="ci-customer-cell"><div class="ci-cell-label">PHONE / <span class="ar">الموبايل</span></div><div class="ci-cell-value">${customer.Phone || '—'}</div></div>
          <div class="ci-customer-cell ci-customer-row-border"><div class="ci-cell-label">COMPANY NAME / <span class="ar">اسم الشركة</span></div><div class="ci-cell-value">${customer.CompanyName || inv.CustomerName || '—'}</div></div>
          <div class="ci-customer-cell ci-customer-row-border"><div class="ci-cell-label">ADDRESS / <span class="ar">العنوان</span></div><div class="ci-cell-value">${customer.Address || '—'}</div></div>
          <div class="ci-customer-cell ci-customer-row-border"><div class="ci-cell-label">EMAIL / <span class="ar">الإيميل</span></div><div class="ci-cell-value">${customer.Email || '—'}</div></div>
        </div>
        <table class="ci-products-table">
          <thead><tr>
            <th style="width:4%">NO</th>
            <th style="width:28%">PRODUCT DESCRIPTION<span class="ar-th">وصف المنتج</span></th>
            <th style="width:12%">PACK SIZE<span class="ar-th">حجم العبوة</span></th>
            <th style="width:14%">UNITS / CARTON<span class="ar-th">عدد الوحدات / الكرتونة</span></th>
            <th style="width:13%">QTY (CARTONS)<span class="ar-th">الكمية (كرتونة)</span></th>
            <th style="width:14%">UNIT PRICE (${currency})<span class="ar-th">سعر الوحدة</span></th>
            <th style="width:15%">TOTAL VALUE (${currency})<span class="ar-th">الإجمالي</span></th>
          </tr></thead>
          <tbody>${itemsHtml || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">لا توجد منتجات</td></tr>'}</tbody>
          <tfoot><tr>
            <td colspan="4" class="ci-total-label-cell">Total Quantity (Cartons) / <span class="ar-total">إجمالي الكمية</span></td>
            <td class="ci-total-qty">${totalCartons.toLocaleString('en-US')} cartons</td>
            <td class="ci-total-value-header">TOTAL VALUE<br>(${currency})</td>
            <td class="ci-grand-total">$${fmtNum(inv.GrandTotal)}</td>
          </tr></tfoot>
        </table>
        <div class="ci-ports">
          <div>port of loading:- <strong>${portLoad}</strong></div>
          <div>port of discharge:- <strong>${portDisc}</strong></div>
        </div>
        <div class="ci-terms">
          <div class="ci-terms-title">PAYMENT TERMS, DELIVERY &amp; LIABILITY — شروط السداد والتسليم والمسؤولية</div>
          <div class="ci-terms-grid">
            <div class="ci-terms-section"><div class="ci-terms-section-title">PAYMENT TERMS</div><ul><li>Advance payment before starting production 50%</li><li>Before loading from factory 50%</li><li>Production and shipment will not commence unless all due payments are fully received</li></ul></div>
            <div class="ci-terms-section ci-terms-ar"><div class="ci-terms-section-title">شروط السداد</div><ul><li>50% من إجمالي قيمة الفاتورة قبل بدء الإنتاج.</li><li>50% قبل تحميل البضاعة من أرض المصنع.</li><li>لا يتم الإنتاج أو التحميل قبل استلام الدفعات كاملة.</li></ul></div>
            <div class="ci-terms-section"><div class="ci-terms-section-title">DELIVERY &amp; RISK TRANSFER</div><p>Goods are delivered Ex-Works (Factory). All risks transfer to the buyer upon loading.</p></div>
            <div class="ci-terms-section ci-terms-ar"><div class="ci-terms-section-title">التسليم وتحمل المخاطر</div><p>يتم تسليم البضاعة أرض المصنع وتنتقل المسؤولية للمشتري فور التحميل.</p></div>
            <div class="ci-terms-section"><div class="ci-terms-section-title">LIABILITY &amp; CUSTOMS</div><p>The exporter bears no responsibility after loading. All duties and clearance are buyer's responsibility.</p></div>
            <div class="ci-terms-section ci-terms-ar"><div class="ci-terms-section-title">المسؤولية والجمارك</div><p>لا تتحمل الشركة أي مسؤولية بعد التحميل. جميع إجراءات الاستيراد على عاتق المشتري.</p></div>
          </div>
        </div>
        <div class="ci-footer-notes">
          <div>The quotation / invoice is valid for two weeks (14 days) from the date of issue — مدة صلاحية الفاتورة (14 يوماً) من تاريخ الإصدار</div>
          <div>This invoice is issued for commercial and customs purposes only — تم إصدار هذه الفاتورة لأغراض تجارية وجمركية فقط</div>
        </div>
      </div>
    </body></html>`;

        const win = window.open('', '_blank');
        win.document.write(invoiceHtml);
        win.document.close();
        setTimeout(()=>win.print(), 600);
    } catch (err) {
        showToast('خطأ في طباعة الفاتورة: ' + err.message, 'error');
    }
}

function previewInvoice() {
    const customerSel = document.getElementById('invCustomer');
    const salesSel = document.getElementById('invSalesRep');
    const socialSel = document.getElementById('invSocialRep');
    const custOpt = customerSel.options[customerSel.selectedIndex];

    const customer = {
        CompanyName: custOpt?.dataset.name || custOpt?.text || '—',
        Country: custOpt?.dataset.country || '—',
        Phone: custOpt?.dataset.phone || '—',
        Email: custOpt?.dataset.email || '—',
        Website: custOpt?.dataset.website || '—',
        Address: custOpt?.dataset.address || '—',
    };

    const subtotal = invItems.reduce((s,i)=>s + i.LineTotal, 0);
    const disc = parseDiscountInput(document.getElementById('invDiscount').value, subtotal);
    const discPct = disc.pct;
    const discVal = disc.value;
    const afterDisc = subtotal - discVal;
    const salesRate = parseFloat(document.getElementById('invSalesRate')?.value) || 0;
    const socialRate = parseFloat(document.getElementById('invSocialRate')?.value) || 0;

    const inv = {
        InvoiceNumber: document.getElementById('invNumber').value || '(مسودة)',
        InvoiceDate: document.getElementById('invDate').value,
        CustomerName: customer.CompanyName,
        CustomerID: customerSel.value,
        SalesRepName: salesSel.options[salesSel.selectedIndex]?.dataset.name || '—',
        SocialRepName: socialSel.options[socialSel.selectedIndex]?.dataset.name || '—',
        Subtotal: subtotal,
        DiscountPercent: discPct,
        DiscountValue: discVal,
        TotalAfterDiscount: afterDisc,
        GrandTotal: afterDisc,
        SalesCommissionRate: salesRate,
        SalesCommission: afterDisc * salesRate / 100,
        SocialCommissionRate: socialRate,
        SocialCommission: afterDisc * socialRate / 100,
        PortOfLoading: document.getElementById('invPortLoading').value,
        PortOfDischarge: document.getElementById('invPortDischarge').value,
        Notes: document.getElementById('invNotes').value,
        RunNumber: document.getElementById('invRunNumber').value,
        ProductionOrderDate: document.getElementById('invProductionOrderDate').value,
        ProductionMonth: document.getElementById('invProductionMonth').value,
        Expiry: document.getElementById('invExpiry').value,
        ProductionNotes: document.getElementById('invProductionNotes').value,
        PurchasingNotes: document.getElementById('invPurchasingNotes').value,
        ManufacturingNotes: document.getElementById('invManufacturingNotes').value,
        Status: 'Draft',
    };

    renderInvoicePrint(inv, invItems.filter(i=>i.ProductID), customer);
    openModal('invoicePreviewModal');
}

// ════════════════════════════════════════
// FLAVORS MANAGEMENT
// ════════════════════════════════════════
async function loadFlavors() {
    try {
        state.flavors = await cached('flavors', 'getFlavors');
    } catch (_) {}
}

function getFlavorsForProduct(productId) {
    return state.flavors.filter(f=>String(f.ProductID) === String(productId));
}

async function openFlavorsModal(productId, productName) {
    // تأكد إن النكهات محملة قبل ما نفتح الـ modal
    if (!state.flavors || !state.flavors.length) {
        await loadFlavors();
    }
    const flavors = state.flavors.filter(f=>String(f.ProductID) === String(productId));
    const pn = productName.replace(/'/g, "\\'");
    const rows = flavors.length ? flavors.map(f=>`
        <tr>
          <td>${f.FlavorName}</td>
          <td>${f.FlavorNameAr || '—'}</td>
          <td><button class="btn-icon del" onclick="deleteFlavor('${f.ID}','${productId}','${pn}')"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px">لا توجد نكهات بعد</td></tr>';

    const html = `
    <div style="margin-bottom:16px">
      <h3 style="margin-bottom:4px">نكهات: ${productName}</h3>
      <p style="color:var(--text-muted);font-size:13px">أضف النكهات المتاحة لهذا المنتج</p>
    </div>
    <table class="data-table" style="margin-bottom:20px">
      <thead><tr><th>الاسم (EN)</th><th>الاسم (AR)</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
      <div class="form-group" style="margin:0">
        <label>اسم النكهة (EN)</label>
        <input id="newFlavorEn" placeholder="e.g. Strawberry" />
      </div>
      <div class="form-group" style="margin:0">
        <label>اسم النكهة (AR)</label>
        <input id="newFlavorAr" placeholder="مثال: فراولة" dir="rtl"/>
      </div>
      <button class="btn btn-primary" onclick="addFlavor('${productId}','${pn}')">
        <i class="fas fa-plus"></i> إضافة
      </button>
    </div>`;

    document.getElementById('flavorModalBody').innerHTML = html;
    openModal('flavorModal');
}

async function addFlavor(productId, productName) {
    const en = document.getElementById('newFlavorEn').value.trim();
    const ar = document.getElementById('newFlavorAr').value.trim();
    if (!en) {
        showToast('أدخل اسم النكهة', 'warning');
        return;
    }
    try {
        await apiPost('addFlavor', {
            data: {
                ProductID: productId,
                ProductName: productName,
                FlavorName: en,
                FlavorNameAr: ar
            }
        });
        invalidateCache('flavors');
        await loadFlavors();
        openFlavorsModal(productId, productName);
        showToast('تمت إضافة النكهة');
    } catch (e) {
        showToast('خطأ: ' + e.message, 'error');
    }
}

async function deleteFlavor(id, productId, productName) {
    if (!confirm('حذف هذه النكهة؟'))
        return;
    try {
        await apiPost('deleteFlavor', {
            id
        });
        invalidateCache('flavors');
        await loadFlavors();
        openFlavorsModal(productId, productName);
        showToast('تم حذف النكهة');
    } catch (e) {
        showToast('خطأ', 'error');
    }
}

// ════════════════════════════════════════
// PRODUCTION ORDER PRINT
// ════════════════════════════════════════
async function printProductionOrder(id) {
    const inv = state.invoices.find(i=>i.ID === id);
    if (!inv)
        return;
    try {
        const items = await cachedInvoiceItems(id);
        // تأكد إن النكهات محملة
        if (!state.flavors || !state.flavors.length) {
            state.flavors = await cached('flavors', 'getFlavors');
        }
        const rows = items.map((item,i)=>{
            let flavorIds = [];
            try {
                flavorIds = JSON.parse(item.Flavors || '[]');
            } catch {}
            // الـ Flavors المخزنة هي IDs — نحولها لأسماء من state.flavors
            const resolvedFlavors = flavorIds.map(f=>{
                if (typeof f === 'object' && (f.en || f.ar))
                    return f;
                // legacy object format
                const found = state.flavors.find(sf=>sf.ID === f || sf.ID === String(f));
                return found ? {
                    en: found.FlavorName,
                    ar: found.FlavorNameAr || ''
                } : {
                    en: String(f),
                    ar: ''
                };
            }
            ).filter(f=>f.en);
            const flavorsHtml = resolvedFlavors.length ? resolvedFlavors.map(f=>`<span style="display:inline-block;background:#e8f4fd;border:1px solid #b3d7f0;border-radius:4px;padding:2px 8px;margin:2px;font-size:9pt">${f.en}${f.ar ? ' / ' + f.ar : ''}</span>`).join('') : '<span style="color:#aaa;font-size:9pt">بدون نكهة محددة</span>';
            return `<tr>
        <td style="text-align:center;font-weight:700">${i + 1}</td>
        <td style="font-weight:700;font-size:11pt">${item.ProductName}</td>
        <td style="text-align:center;font-size:12pt;font-weight:900">${item.CartonQty || item.Quantity}</td>
        <td>${item.PackSize || '—'}</td>
        <td>${item.UnitsPerCarton || '—'}</td>
        <td>${flavorsHtml}</td>
        <td style="text-align:center;font-size:16pt">☐</td>
      </tr>`;
        }
        ).join('');

        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html><html dir="ltr"><head>
      <meta charset="UTF-8">
      <title>Production Order - ${inv.InvoiceNumber}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Cairo',Arial,sans-serif;padding:24px;color:#111}
        .po-header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1c2340;padding-bottom:14px;margin-bottom:18px}
        .po-title{font-size:22pt;font-weight:900;color:#1c2340}
        .po-sub{font-size:10pt;color:#666;margin-top:4px}
        .po-meta{text-align:right;font-size:10pt;line-height:1.8}
        .po-meta strong{font-size:13pt;color:#c0392b}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th{background:#1c2340;color:#fff;padding:9px 10px;font-size:10pt;text-align:center}
        td{padding:8px 10px;border:1px solid #ddd;vertical-align:middle;font-size:10pt}
        tr:nth-child(even) td{background:#f9f9f9}
        .po-footer{margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}
        .sign-box{border-top:2px solid #333;padding-top:8px;text-align:center;font-size:9pt;color:#555;padding-bottom:30px}
        .po-order-box{border:2px solid #1c2340;border-radius:6px;margin-bottom:18px;overflow:hidden}
        .po-order-title{background:#e8522a;color:#fff;padding:7px 14px;font-size:10pt;font-weight:800;letter-spacing:.5px;display:flex;align-items:center;gap:10px}
        .po-order-grid{display:grid;grid-template-columns:1fr 1fr 1fr;background:#fff8f5}
        .po-order-cell{padding:10px 16px;border-left:1px solid #f0c4b0}
        .po-order-cell:last-child{border-left:none}
        .po-order-label{font-size:7pt;font-weight:800;color:#c0392b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
        .po-order-value{font-size:12pt;font-weight:900;color:#111}
        .po-order-expiry{color:#c0392b}
        .po-order-notes{padding:8px 16px;background:#fff8f5;border-top:1px solid #f0c4b0;direction:rtl;text-align:right;font-size:9pt;color:#333;border-top:1px solid #f0c4b0}
        @media print{body{padding:10px}}
      </style>
    </head><body>
      <div class="po-header">
        <div>
          <div class="po-title">🏭 Production Order — أمر إنتاج</div>
          <div class="po-sub">EgyGulf Foods For Snacks &amp; Food Industries</div>
        </div>
        <div class="po-meta">
          <div>Invoice / فاتورة: <strong>${inv.InvoiceNumber}</strong></div>
          <div>Date: ${(inv.ProductionOrderDate || inv.InvoiceDate) ? new Date((inv.ProductionOrderDate || inv.InvoiceDate) + 'T12:00:00').toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }) : '—'}</div>
          <div>Customer: <strong>${inv.CustomerName}</strong></div>
        </div>
      </div>
      <div class="po-order-box">
        <div class="po-order-title">
          <span style="direction:rtl">أمر الإنتاج</span>
          <span style="opacity:.7">—</span>
          <span>PRODUCTION ORDER INFO</span>
        </div>
        <div class="po-order-grid">
          <div class="po-order-cell">
            <div class="po-order-label">RUN NO. / <span style="text-transform:none;letter-spacing:0;font-weight:600;color:#888">رقم التشغيل</span></div>
            <div class="po-order-value">${inv.RunNumber || '—'}</div>
          </div>
          <div class="po-order-cell">
            <div class="po-order-label">PRODUCTION MONTH / <span style="text-transform:none;letter-spacing:0;font-weight:600;color:#888">شهر الإنتاج</span></div>
            <div class="po-order-value">${inv.ProductionMonth || '—'}</div>
          </div>
          <div class="po-order-cell">
            <div class="po-order-label">EXPIRY / <span style="text-transform:none;letter-spacing:0;font-weight:600;color:#888">الصلاحية</span></div>
            <div class="po-order-value po-order-expiry">${inv.Expiry || '—'}</div>
          </div>
        </div>
        ${inv.ProductionNotes ? `<div class="po-order-notes"><strong style="color:#c0392b">ملاحظات الإنتاج: </strong>${inv.ProductionNotes}</div>` : ''}
      </div>
      <table>
        <thead><tr>
          <th>#</th><th>Product / المنتج</th><th>Cartons / كرتون</th>
          <th>Pack Size</th><th>Units/Carton</th><th>Flavors / النكهات</th><th>✓</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="border:1.5px solid #1c2340;border-radius:6px;overflow:hidden">
          <div style="background:#1c2340;color:#fff;padding:7px 14px;font-size:10pt;font-weight:800;direction:rtl">ملاحظات المشتريات</div>
          <div style="min-height:70px;padding:10px 14px;background:#fff;direction:rtl;font-size:10pt;white-space:pre-wrap">${inv.PurchasingNotes || ''}</div>
        </div>
        <div style="border:1.5px solid #e8522a;border-radius:6px;overflow:hidden">
          <div style="background:#e8522a;color:#fff;padding:7px 14px;font-size:10pt;font-weight:800;direction:rtl">ملاحظات التصنيع</div>
          <div style="min-height:70px;padding:10px 14px;background:#fff;direction:rtl;font-size:10pt;white-space:pre-wrap">${inv.ManufacturingNotes || ''}</div>
        </div>
      </div>
      <div class="po-footer">
        <div class="sign-box">Production Manager<br>مدير الإنتاج<br><br></div>
        <div class="sign-box">Quality Control<br>مراقبة الجودة<br><br></div>
        <div class="sign-box">Warehouse<br>المستودع<br><br></div>
      </div>
    </body></html>`);
        win.document.close();
        setTimeout(()=>win.print(), 500);
    } catch (err) {
        showToast('خطأ في طباعة أمر الإنتاج', 'error');
    }
}

// ════════════════════════════════════════
// COMMERCIAL INVOICE TEMPLATE
// ════════════════════════════════════════
function renderInvoicePrint(inv, items, customer={}) {
    const comp = COMPANY;
    const compName = comp.CompanyName || 'Egyptian Gulf International';
    const compNameAr = comp.CompanyNameAr || 'الشركة المصرية الخليجية الدولية للصناعات والأغذية الخفيفة';
    const compEmail = comp.CompanyEmail || 'export@egygulf-foods.com';
    const compWebsite = comp.CompanyWebsite || 'www.egygulf-foods.com';
    const compAddress = comp.CompanyAddress || 'Cairo – Alexandria Agricultural Road, Km 90, Tanta, Egypt';
    const portLoad = inv.PortOfLoading || comp.PortLoading || 'Alexandria Port, Egypt';
    const portDisc = inv.PortOfDischarge || (customer.Country ? customer.Country + ' Port' : '—');
    const currency = CURRENCY || 'USD';

    const totalCartons = items.reduce((s,i)=>s + (parseFloat(i.CartonQty) || parseFloat(i.Quantity) || 0), 0);

    const itemsHtml = items.map((item,i)=>{
        let flavorNames = [];
        try {
            const f = JSON.parse(item.Flavors || item.FlavorNames || '[]');
            flavorNames = f.map(x=>typeof x === 'object' ? (x.en + (x.ar ? ' / ' + x.ar : '')) : x).filter(Boolean);
        } catch {}
        const flavorsStr = flavorNames.length ? `<div style="font-size:8pt;color:#555;margin-top:3px">🌶 ${flavorNames.join(' • ')}</div>` : '';
        return `
    <tr>
      <td style="text-align:center;font-weight:600">${i + 1}</td>
      <td class="desc-cell">${item.ProductName || '—'}${flavorsStr}</td>
      <td>${item.PackSize || item.Size || '—'}</td>
      <td>${item.UnitsPerCarton || '—'}</td>
      <td style="font-weight:700">${(parseFloat(item.CartonQty) || parseFloat(item.Quantity) || 0).toLocaleString('en-US')}</td>
      <td>$${fmtNum(item.UnitPrice)}</td>
      <td style="font-weight:700">$${fmtNum(item.LineTotal)}</td>
    </tr>`;
    }
    ).join('');

    document.getElementById('invoicePrintContent').innerHTML = `
<div class="commercial-invoice">

  <!-- TOP ADDRESS -->
  <div class="ci-top-address">
    <strong>Address:</strong> ${compAddress} &nbsp;&nbsp;
    <strong>website:</strong> ${compWebsite} &nbsp;&nbsp;
    <strong>EMail:</strong> ${compEmail}
  </div>

  <!-- HEADER -->
  <div class="ci-header">
    <div class="ci-header-logo">
      <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIbGNtcwIQAABtbnRyUkdCIFhZWiAH4gADABQACQAOAB1hY3NwTVNGVAAAAABzYXdzY3RybAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWhhbmSdkQA9QICwPUB0LIGepSKOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAABxjcHJ0AAABDAAAAAx3dHB0AAABGAAAABRyWFlaAAABLAAAABRnWFlaAAABQAAAABRiWFlaAAABVAAAABRyVFJDAAABaAAAAGBnVFJDAAABaAAAAGBiVFJDAAABaAAAAGBkZXNjAAAAAAAAAAV1UkdCAAAAAAAAAAAAAAAAdGV4dAAAAABDQzAAWFlaIAAAAAAAAPNUAAEAAAABFslYWVogAAAAAAAAb6AAADjyAAADj1hZWiAAAAAAAABilgAAt4kAABjaWFlaIAAAAAAAACSgAAAPhQAAtsRjdXJ2AAAAAAAAACoAAAB8APgBnAJ1A4MEyQZOCBIKGAxiDvQRzxT2GGocLiBDJKwpai5+M+s5sz/WRldNNlR2XBdkHWyGdVZ+jYgskjacq6eMstu+mcrH12Xkd/H5////2wBDAAkGBwgHBgkICAgKCgkLDhcPDg0NDhwUFREXIh4jIyEeICAlKjUtJScyKCAgLj8vMjc5PDw8JC1CRkE6RjU7PDn/2wBDAQoKCg4MDhsPDxs5JiAmOTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTk5OTn/wAARCAYkBiADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3GiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoo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/wCtXSXumW92Msu1/wC8vB/H1rMk8POPuTAj0Ir5eeVYrDzvRenkeosXSqq00VZtZu5F25VM9So5rPJLkkkknkk8k1sL4fmJ5mQD2BNXLXQoIyGlYyEdjwPyqXl+OxLXtL29Q+sUKa9wytK057uQMykQg8npn2FdUihF2gcCkRFRcKAAOOKd2r6PA4GGEhZbvdnnV6zqyu9hroHQqwBBGOa5XVNOe0kJVSYSeD1x7GutpjorqQwyDwciljsDDFws9+jChXdF3Wxw6sUIKkgg5BBwRWjFrV4ihSyPjuRz+laVzoUEhLROYye3UVTPh+YHiZCPcEV86sBjsM2qd7HpOvh6qvIo3d/cXfEj/L2UcD/69VlDMQACSeAByTW3H4ebIMk4+gFadnptvaDKLlu7Hk1UMqxWInzVn95LxdKmrQRW0TTjbL50o/esPyHpWtSUtfUYfDwoQVOOx5dSbqScmZus2P2yDcg/epkr7+1csylSQQQQcEHgiu7rPvdLgu/mYbX/ALw6/j615WZ5X9Y/eU9JfmdeGxXsvdlscxb3E1u26KQqfbofwq1JrF66bfMC9iQADVtvD8uTtmUj3BzT4fD3QyzZHoox+teTSwWYR9yN0vwOuVfDv3nZv0Mm2gmvJtq5LHksecD1NQuCrFT1Bwa7O1tYrWPy4lAHf3rMvtE86ZpYXC7jkgjjNbYjJaipJx1l1Ip42Lm09F0KnhsE3rntsP8AMV0rAEYNUdM09bFGydzt1OKv17mXYeVCgoT3OHEVFUqOS2OO1Gze0nIKnyycqe2PSoLe4kt5BJG2GH612c0Mc6FJFDKeoNZU+gRMcxSMg9OorxsVk9WFT2lB+Z2UsZBx5aiII/EDgAPCCe5BxUN3rc06FUURgjBOcmpG8PzD7syEe4Ip0fh6Qn55xj2FS45nNcjvYaeFTuYnWul0GyMEbTSLh36A9QKms9JtrZg+C7joW5x9K0RiuzLcpdCftar1McTi1UXLHYWiiivfOEKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigApjxpIu11DD0IzT6KAKEmjaXLkyadaPn+9Cp/pSRaNpUPMWm2aH/AGYFH8hWhRRzPuBHHDFH9yNE+gAqSiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z" style="width:110px;height:auto;display:block">
    </div>
    <div class="ci-header-company">
      <div class="ci-company-en">${compName}</div>
      <div class="ci-company-en-sub">For Snacks &amp; Food Industries</div>
      <div class="ci-company-ar">${compNameAr}</div>
      <div class="ci-company-ar" style="font-size:7.5pt;color:#888;direction:ltr;text-align:left;margin-top:2px">للصناعات و الأغذية الخفيفة</div>
    </div>
    <div class="ci-header-right">
      <div class="ci-header-right-top">
        <div class="ci-header-right-name">${compName}</div>
        <div class="ci-header-right-name">For Snacks &amp; Food Industries</div>
        <div class="ci-header-right-sub">للصناعات والأغذية الخفيفة</div>
      </div>
      <div class="ci-header-right-bottom">
        <table class="ci-inv-details">
          <tr><td class="ci-inv-label">INVOICE NO:</td><td class="ci-inv-value">${inv.InvoiceNumber || inv.ID || '—'}</td></tr>
          <tr><td class="ci-inv-label">INVOICE DATE:</td><td class="ci-inv-value">${fmtDate(inv.InvoiceDate)}</td></tr>
        </table>
      </div>
    </div>
  </div>

  <!-- TITLE -->
  <div class="ci-title-bar">
    <span class="ci-title-ar">فاتورة تجارية</span>
    <span class="ci-title-sep">—</span>
    <span class="ci-title-en">COMMERCIAL INVOICE</span>
  </div>

  <!-- CUSTOMER -->
  <div class="ci-customer-grid">
    <div class="ci-customer-cell"><div class="ci-cell-label">WEBSITE / <span class="ar">الموقع</span></div><div class="ci-cell-value">${customer.Website || '—'}</div></div>
    <div class="ci-customer-cell"><div class="ci-cell-label">COUNTRY / <span class="ar">البلد</span></div><div class="ci-cell-value">${customer.Country || '—'}</div></div>
    <div class="ci-customer-cell"><div class="ci-cell-label">PHONE / <span class="ar">الموبايل</span></div><div class="ci-cell-value">${customer.Phone || '—'}</div></div>
    <div class="ci-customer-cell ci-customer-row-border"><div class="ci-cell-label">COMPANY NAME / <span class="ar">اسم الشركة</span></div><div class="ci-cell-value">${customer.CompanyName || inv.CustomerName || '—'}</div></div>
    <div class="ci-customer-cell ci-customer-row-border"><div class="ci-cell-label">ADDRESS / <span class="ar">العنوان</span></div><div class="ci-cell-value">${customer.Address || '—'}</div></div>
    <div class="ci-customer-cell ci-customer-row-border"><div class="ci-cell-label">EMAIL / <span class="ar">الإيميل</span></div><div class="ci-cell-value">${customer.Email || '—'}</div></div>
  </div>

  <!-- PRODUCTS TABLE -->
  <table class="ci-products-table">
    <thead>
      <tr>
        <th style="width:4%">NO</th>
        <th style="width:28%">PRODUCT DESCRIPTION<span class="ar-th">وصف المنتج</span></th>
        <th style="width:12%">PACK SIZE<span class="ar-th">حجم العبوة</span></th>
        <th style="width:14%">UNITS / CARTON<span class="ar-th">عدد الوحدات / الكرتونة</span></th>
        <th style="width:13%">QTY (CARTONS)<span class="ar-th">الكمية (كرتونة)</span></th>
        <th style="width:14%">UNIT PRICE (${currency})<span class="ar-th">سعر الوحدة (${currency === 'USD' ? 'دولار' : currency})</span></th>
        <th style="width:15%">TOTAL VALUE (${currency})<span class="ar-th">الإجمالي (${currency === 'USD' ? 'دولار' : currency})</span></th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">لا توجد منتجات</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="ci-total-label-cell">Total Quantity (Cartons) / <span class="ar-total">إجمالي الكمية</span></td>
        <td class="ci-total-qty">${totalCartons.toLocaleString('en-US')} cartons</td>
        <td class="ci-total-value-header">TOTAL VALUE<br>(${currency})</td>
        <td class="ci-grand-total">$${fmtNum(inv.GrandTotal)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- PORTS -->
  <div class="ci-ports">
    <div>port of loading:- <strong>${portLoad}</strong></div>
    <div>port of discharge:- <strong>${portDisc}</strong></div>
  </div>

  <!-- PAYMENT TERMS -->
  <div class="ci-terms">
    <div class="ci-terms-title">PAYMENT TERMS, DELIVERY &amp; LIABILITY — شروط السداد والتسليم والمسؤولية</div>
    <div class="ci-terms-grid">
      <div class="ci-terms-section"><div class="ci-terms-section-title">PAYMENT TERMS</div><ul><li>Advance payment before starting production 50%</li><li>Before loading from factory 50%</li><li>Production and shipment will not commence unless all due payments are fully received</li></ul></div>
      <div class="ci-terms-section ci-terms-ar"><div class="ci-terms-section-title">شروط السداد</div><ul><li>50% من إجمالي قيمة الفاتورة قبل بدء الإنتاج.</li><li>50% قبل تحميل البضاعة من أرض المصنع.</li><li>لا يتم الإنتاج أو التحميل قبل استلام الدفعات كاملة.</li></ul></div>
      <div class="ci-terms-section"><div class="ci-terms-section-title">DELIVERY &amp; RISK TRANSFER</div><p>Goods are delivered Ex-Works (Factory). All risks and responsibilities transfer to the buyer immediately upon loading.</p></div>
      <div class="ci-terms-section ci-terms-ar"><div class="ci-terms-section-title">التسليم وتحمل المخاطر</div><p>يتم تسليم وتحميل البضاعة أرض المصنع، وتنتقل كامل المسؤولية والمخاطر إلى المشتري فور التحميل.</p></div>
      <div class="ci-terms-section"><div class="ci-terms-section-title">LIABILITY &amp; CUSTOMS RESPONSIBILITY</div><p>The exporter bears no responsibility for loss, damage, delay, or customs clearance issues after loading. All import permits, duties, taxes, and clearance procedures are the buyer's responsibility.</p></div>
      <div class="ci-terms-section ci-terms-ar"><div class="ci-terms-section-title">المسؤولية والجمارك</div><p>لا تتحمل الشركة أي مسؤولية عن أي تلف أو فقد أو تأخير أو تخليص جمركي بعد التحميل.</p></div>
      <div class="ci-terms-section"><div class="ci-terms-section-title">LIMITATION OF LIABILITY</div><p>The exporter shall not be liable for any indirect or consequential damages once goods leave the factory.</p></div>
      <div class="ci-terms-section ci-terms-ar"><div class="ci-terms-section-title">تحديد المسؤولية</div><p>لا تتحمل الشركة المصدرة أي مسؤولية عن أضرار غير مباشرة أو تبعية بعد مغادرة البضاعة للمصنع.</p></div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="ci-footer-notes">
    <div>The quotation / invoice is valid for two weeks (14 days) from the date of issue — مدة صلاحية عرض السعر أو الفاتورة (14 يوماً) من تاريخ الإصدار</div>
    <div>This invoice is issued for commercial and customs purposes only — تم إصدار هذه الفاتورة لأغراض تجارية وجمركية فقط</div>
  </div>

</div>`;
}

// ════════════════════════════════════════
// TAB 7: REPORTS
// ════════════════════════════════════════
function setPeriod(period, btn) {
    state.reportPeriod = period;
    document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('customDateRange').style.display = period === 'custom' ? 'flex' : 'none';
    if (period !== 'custom')
        loadReports();
}

function switchReport(report, btn) {
    state.currentReport = report;
    document.querySelectorAll('.report-tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.report-section').forEach(s=>s.classList.remove('active'));
    document.getElementById(`report-${report}`).classList.add('active');
    loadReports();
}

async function loadReports() {
    const params = {
        period: state.reportPeriod
    };
    if (state.reportPeriod === 'custom') {
        params.from = document.getElementById('reportFrom').value;
        params.to = document.getElementById('reportTo').value;
        if (!params.from || !params.to)
            return;
    }
    try {
        switch (state.currentReport) {
        case 'revenue':
            await loadRevenueReport(params);
            break;
        case 'customers':
            await loadCustomerReport(params);
            break;
        case 'products':
            await loadProductReport(params);
            break;
        case 'salesteam':
            await loadSalesReport(params);
            break;
        case 'socialteam':
            await loadSocialReport(params);
            break;
        case 'commissions':
            await loadCommissionReport(params);
            break;
        }
    } catch (err) {
        if (err.message !== 'NO_API')
            showToast('خطأ في التقارير: ' + err.message, 'error');
    }
}

async function loadRevenueReport(params) {
    const res = await apiGet('getRevenueReport', params);
    const {invoices, total} = res.data;
    document.getElementById('revenueStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div><div class="stat-label">إجمالي الإيرادات</div><div class="stat-value">${fmtNum(total)}</div><div class="stat-sub">${CURRENCY}</div></div>
    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-file-invoice"></i></div><div class="stat-label">عدد الفواتير</div><div class="stat-value">${invoices.length}</div></div>
    <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-chart-line"></i></div><div class="stat-label">متوسط قيمة الفاتورة</div><div class="stat-value">${fmtNum(invoices.length ? total / invoices.length : 0)}</div><div class="stat-sub">${CURRENCY}</div></div>`;
    document.getElementById('revenueTableBody').innerHTML = invoices.length ? invoices.map(i=>`<tr><td>${i.InvoiceNumber || i.ID}</td><td>${fmtDate(i.InvoiceDate)}</td><td>${i.CustomerName}</td><td>${fmt(i.GrandTotal)}</td><td>${statusBadge(i.Status)}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">لا توجد بيانات</td></tr>';
}

async function loadCustomerReport(params) {
    const res = await apiGet('getCustomerReport', params);
    document.getElementById('customerReportBody').innerHTML = (res.data || []).length ? res.data.map(r=>`<tr><td><strong>${r.customerName}</strong></td><td>${r.invoiceCount}</td><td>${fmt(r.totalRevenue)}</td><td>${fmtDate(r.lastInvoiceDate)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">لا توجد بيانات</td></tr>';
}

async function loadProductReport(params) {
    const res = await apiGet('getProductReport', params);
    document.getElementById('productReportBody').innerHTML = (res.data || []).length ? res.data.map(r=>`<tr><td><strong>${r.productName}</strong></td><td>${r.totalQty}</td><td>${r.totalCartons}</td><td>${fmt(r.totalRevenue)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">لا توجد بيانات</td></tr>';
}

async function loadSalesReport(params) {
    const res = await apiGet('getSalesReport', params);
    document.getElementById('salesReportBody').innerHTML = (res.data || []).length ? res.data.map(r=>`<tr><td><strong>${r.repName}</strong></td><td>${r.invoiceCount}</td><td>${fmt(r.totalRevenue)}</td><td style="color:var(--success)">${fmt(r.totalCommission)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">لا توجد بيانات</td></tr>';
}

async function loadSocialReport(params) {
    const res = await apiGet('getSocialReport', params);
    document.getElementById('socialReportBody').innerHTML = (res.data || []).length ? res.data.map(r=>`<tr><td><strong>${r.repName}</strong></td><td>${r.leadsGenerated}</td><td>${r.closedDeals}</td><td style="color:var(--success)">${fmt(r.totalCommission)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">لا توجد بيانات</td></tr>';
}

async function loadCommissionReport(params) {
    const res = await apiGet('getCommissionReport', params);
    const {commissions, totalSales, totalSocial, grandTotal} = res.data;
    document.getElementById('commissionStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-handshake"></i></div><div class="stat-label">عمولات المبيعات</div><div class="stat-value">${fmtNum(totalSales)}</div><div class="stat-sub">${CURRENCY}</div></div>
    <div class="stat-card"><div class="stat-icon red"><i class="fas fa-bullhorn"></i></div><div class="stat-label">عمولات السوشيال</div><div class="stat-value">${fmtNum(totalSocial)}</div><div class="stat-sub">${CURRENCY}</div></div>
    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-coins"></i></div><div class="stat-label">إجمالي العمولات</div><div class="stat-value">${fmtNum(grandTotal)}</div><div class="stat-sub">${CURRENCY}</div></div>`;
    document.getElementById('commissionReportBody').innerHTML = (commissions || []).length ? commissions.map(c=>`<tr>
        <td>${c.Type === 'Sales' ? '<span class="badge badge-confirmed">مبيعات</span>' : '<span class="badge badge-active">سوشيال</span>'}</td>
        <td><strong>${c.RepName}</strong></td><td>${c.InvoiceNumber}</td><td>${fmtDate(c.InvoiceDate)}</td>
        <td>${c.CommissionRate}%</td><td style="color:var(--success)">${fmt(c.CommissionAmount)}</td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">لا توجد بيانات</td></tr>';
}
// ════════════════════════════════════════
// TO-DO LIST
// ════════════════════════════════════════
async function loadTodos() {
    try {
        state.todos = await cached('todos', 'getTodos');
        renderTodoTable(state.todos);
    } catch (e) {
        showToast('فشل في تحميل المهام', 'danger');
    }
}

function renderTodoTable(todos) {
    const tbody = document.getElementById('todoTableBody');
    const footer = document.getElementById('todoFooter');
    const counter = document.getElementById('todoDoneCount');
    if (!tbody)
        return;

    if (!todos.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">لا توجد مهام بعد</td></tr>';
        if (footer)
            footer.style.display = 'none';
        return;
    }

    tbody.innerHTML = todos.map(t=>{
        const done = t.Done === 'TRUE' || t.Done === true;
        return `<tr style="${done ? 'opacity:.5' : ''}">
      <td><input type="checkbox" ${done ? 'checked' : ''} onchange="todoToggle('${t.ID}',this.checked)" style="width:18px;height:18px;cursor:pointer"></td>
      <td style="${done ? 'text-decoration:line-through' : ''}">${t.TaskText}</td>
      <td>${done ? '<span class="badge badge-confirmed">منتهية</span>' : '<span class="badge badge-draft">قيد التنفيذ</span>'}</td>
      <td><button class="btn btn-sm btn-danger" onclick="todoDelete('${t.ID}')"><i class="fas fa-trash"></i></button></td>
    </tr>`;
    }
    ).join('');

    const doneCount = todos.filter(t=>t.Done === 'TRUE' || t.Done === true).length;
    if (counter)
        counter.textContent = `${doneCount} / ${todos.length} منتهية`;
    if (footer)
        footer.style.display = 'flex';
}

function todoOpenAdd() {
    const f = document.getElementById('todoAddForm');
    if (f) {
        f.style.display = 'block';
        document.getElementById('todoInput').focus();
    }
}

function todoCancelAdd() {
    const f = document.getElementById('todoAddForm');
    if (f)
        f.style.display = 'none';
    const inp = document.getElementById('todoInput');
    if (inp)
        inp.value = '';
}

async function todoConfirmAdd() {
    const inp = document.getElementById('todoInput');
    const text = inp ? inp.value.trim() : '';
    if (!text)
        return;
    try {
        await apiPost('addTodo', {
            data: {
                TaskText: text
            }
        });
        invalidateCache('todos');
        inp.value = '';
        document.getElementById('todoAddForm').style.display = 'none';
        await loadTodos();
        showToast('تمت إضافة المهمة', 'success');
    } catch (e) {
        showToast('فشل في إضافة المهمة', 'danger');
    }
}

async function todoToggle(id, checked) {
    // Optimistic update — نحدث state فوراً قبل انتظار الـ API
    const todo = state.todos ? state.todos.find(t=>t.ID === id) : null;
    if (todo) {
        todo.Done = checked ? 'TRUE' : 'FALSE';
        renderTodoTable(state.todos);
    }
    try {
        await apiPost('updateTodoDone', {
            id,
            data: {
                Done: checked ? 'TRUE' : 'FALSE'
            }
        });
        invalidateCache('todos');
        await loadTodos();
    } catch (e) {
        if (todo) {
            todo.Done = checked ? 'FALSE' : 'TRUE';
            renderTodoTable(state.todos);
        }
        showToast('فشل في تحديث المهمة', 'danger');
    }
}

async function todoDelete(id) {
    try {
        await apiPost('deleteTodo', {
            id
        });
        invalidateCache('todos');
        await loadTodos();
        showToast('تم حذف المهمة', 'success');
    } catch (e) {
        showToast('فشل في حذف المهمة', 'danger');
    }
}

async function todoClearDone() {
    try {
        const todos = await cached('todos', 'getTodos');
        const ids = (todos || []).filter(t=>t.Done === 'TRUE' || t.Done === true).map(t=>t.ID);
        if (!ids.length) {
            showToast('لا توجد مهام منتهية', 'warning');
            return;
        }
        await apiPost('clearDoneTodos', {
            data: {
                ids
            }
        });
        invalidateCache('todos');
        await loadTodos();
        showToast('تم مسح المهام المنتهية', 'success');
    } catch (e) {
        showToast('فشل في مسح المهام', 'danger');
    }
}

// ════════════════════════════════════════
// PACKING LIST
// ════════════════════════════════════════
let plRows = [];

function plInit() {
    // Set today's date
    const d = document.getElementById('plDate');
    if (d && !d.value)
        d.value = new Date().toISOString().split('T')[0];
    if (!plRows.length)
        plAddRow();
    plRender();
}

function plAddRow() {
    plRows.push({
        item: '',
        netW: '',
        grossW: '',
        units: '',
        cartons: ''
    });
    plRender();
}

function plRemoveRow(i) {
    plRows.splice(i, 1);
    plRender();
}

function plUpdate(i, field, val) {
    plRows[i][field] = val;
    plCalcTotals();
}

function plRender() {
    const tbody = document.getElementById('plBody');
    if (!tbody)
        return;
    tbody.innerHTML = plRows.map((r,i)=>`
    <tr>
      <td>${i + 1}</td>
      <td><input class="form-input" style="min-width:180px" value="${r.item}" placeholder="اسم المنتج" oninput="plUpdate(${i},'item',this.value)"></td>
      <td><input class="form-input" style="width:100px" type="number" step="0.001" value="${r.netW}" placeholder="0.000" oninput="plUpdate(${i},'netW',this.value)"></td>
      <td><input class="form-input" style="width:100px" type="number" step="0.001" value="${r.grossW}" placeholder="0.000" oninput="plUpdate(${i},'grossW',this.value)"></td>
      <td><input class="form-input" style="width:80px" type="number" value="${r.units}" placeholder="0" oninput="plUpdate(${i},'units',this.value)"></td>
      <td><input class="form-input" style="width:100px" type="number" value="${r.cartons}" placeholder="0" oninput="plUpdate(${i},'cartons',this.value)"></td>
      <td style="font-weight:600;color:var(--success)">${plCalcRow(r, 'net')}</td>
      <td style="font-weight:600;color:var(--info)">${plCalcRow(r, 'gross')}</td>
      <td><button class="btn-icon del" onclick="plRemoveRow(${i})"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('');
    plCalcTotals();
}

function plCalcRow(r, type) {
    const cartons = parseFloat(r.cartons) || 0;
    if (!cartons)
        return '—';
    if (type === 'net') {
        const net = parseFloat(r.netW) || 0;
        return net ? (net * cartons).toFixed(3) + ' kg' : '—';
    } else {
        const gross = parseFloat(r.grossW) || 0;
        return gross ? (gross * cartons).toFixed(3) + ' kg' : '—';
    }
}

function plCalcTotals() {
    let totalCartons = 0
      , totalNet = 0
      , totalGross = 0;
    plRows.forEach(r=>{
        const c = parseFloat(r.cartons) || 0;
        const n = parseFloat(r.netW) || 0;
        const g = parseFloat(r.grossW) || 0;
        totalCartons += c;
        totalNet += n * c;
        totalGross += g * c;
    }
    );
    const setEl = (id,val)=>{
        const el = document.getElementById(id);
        if (el)
            el.textContent = val;
    }
    ;
    setEl('plTotalCartons', totalCartons ? totalCartons.toLocaleString() : '—');
    setEl('plTotalNet', totalNet ? totalNet.toFixed(3) + ' kg' : '—');
    setEl('plTotalGross', totalGross ? totalGross.toFixed(3) + ' kg' : '—');
}

function plClear() {
    if (!confirm('هتمسح كل الأصناف؟'))
        return;
    plRows = [];
    plAddRow();
}

function plPrint() {
    const customer = document.getElementById('plCustomer')?.value || '';
    const date = document.getElementById('plDate')?.value || '';
    const po = document.getElementById('plPO')?.value || '';

    let totalCartons = 0
      , totalNet = 0
      , totalGross = 0;
    const rows = plRows.map((r)=>{
        const c = parseFloat(r.cartons) || 0;
        const n = parseFloat(r.netW) || 0;
        const g = parseFloat(r.grossW) || 0;
        totalCartons += c;
        totalNet += n * c;
        totalGross += g * c;
        return `<tr>
      <td>${r.item || ''}</td>
      <td>${n ? n.toFixed(3) : ''}</td>
      <td>${n && c ? (n * c).toFixed(2) : ''}</td>
      <td>${g ? g.toFixed(3) : ''}</td>
      <td>${g && c ? (g * c).toFixed(2) : ''}</td>
      <td>${r.units || ''}</td>
      <td>${c || ''}</td>
    </tr>`;
    }
    ).join('');

    const fmtDate = date ? new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }) : '';

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html dir="ltr"><head><meta charset="UTF-8">
  <title>Packing List</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; padding: 16px; background: #fff; color: #000; }

    /* HEADER */
    .header-table { width: 100%; border-collapse: collapse; border: 2px solid #1a3060; margin-bottom: 0; }
    .header-table td { border: 1px solid #1a3060; padding: 6px 10px; vertical-align: middle; }
    .logo-cell { width: 160px; text-align: center; }
    .logo-cell img { max-height: 60px; }
    .logo-text { font-size: 28px; font-weight: 900; color: #f5a623; letter-spacing: -1px; }
    .logo-text span { color: #1a3060; }
    .center-logo { width: 100px; text-align: center; }
    .company-info { text-align: right; font-size: 11px; line-height: 1.6; }
    .company-info .en { font-weight: bold; font-size: 12px; color: #1a3060; }
    .company-info .ar { color: #1a3060; }

    /* INFO ROW */
    .info-table { width: 100%; border-collapse: collapse; border: 2px solid #1a3060; border-top: none; margin-bottom: 0; }
    .info-table td { border: 1px solid #1a3060; padding: 6px 10px; font-size: 11px; }
    .info-table .label { font-weight: bold; color: #1a3060; }

    /* TITLE */
    .title-row { background: #fff; text-align: center; border: 2px solid #1a3060; border-top: none; padding: 8px; }
    .title-row h1 { font-size: 26px; font-weight: 900; color: #1a3060; letter-spacing: 2px; }

    /* WEIGHT HEADER */
    .weight-header { background: #1a3060; color: #fff; text-align: center; border: 2px solid #1a3060; border-top: none; padding: 5px; font-size: 12px; font-weight: bold; letter-spacing: 1px; }

    /* MAIN TABLE */
    .main-table { width: 100%; border-collapse: collapse; border: 2px solid #1a3060; border-top: none; }
    .main-table th { background: #1a3060; color: #fff; padding: 7px 5px; text-align: center; font-size: 11px; border: 1px solid #fff; }
    .main-table td { padding: 7px 5px; text-align: center; border: 1px solid #1a3060; font-size: 11px; }
    .main-table tr:nth-child(even) td { background: #f0f4ff; }
    .main-table .total-row td { background: #1a3060; color: #fff; font-weight: bold; font-size: 13px; border: 1px solid #fff; }

    /* FOOTER */
    .footer-table { width: 100%; border-collapse: collapse; border: 2px solid #1a3060; border-top: none; }
    .footer-table td { border: 1px solid #1a3060; padding: 5px 10px; font-size: 10px; text-align: center; }

    @media print {
      body { padding: 8px; }
      @page { margin: 10mm; }
    }
  </style></head><body>

  <!-- HEADER -->
  <table class="header-table">
    <tr>
      <td class="logo-cell">
        <div class="logo-text">egy<span>gulf</span><br><small style="font-size:11px;font-weight:400;color:#555">Foods</small></div>
      </td>
      <td class="center-logo" style="text-align:center;font-size:10px;color:#1a3060;font-weight:bold;letter-spacing:1px">
        🌿<br>EgyGulf<br>Foods
      </td>
      <td class="company-info">
        <div class="en">Egyptian Gulf International</div>
        <div class="en">For Snacks &amp; Food Industries</div>
        <div class="ar">الشركة المصرية الخليجية الدولية</div>
        <div class="ar">للصناعات والأغذية الخفيفة</div>
      </td>
      <td style="text-align:right;font-size:11px;line-height:1.8;border-right:none">
        <strong>${customer}</strong><br>
        ${po ? 'PO: ' + po : ''}
      </td>
    </tr>
  </table>

  <!-- INFO ROW -->
  <table class="info-table">
    <tr>
      <td class="label" style="width:80px">التاريخ :</td>
      <td>${fmtDate}</td>
      <td style="width:200px"></td>
    </tr>
  </table>

  <!-- TITLE -->
  <div class="title-row"><h1>Packing List</h1></div>

  <!-- WEIGHT LABEL -->
  <div class="weight-header">الـــوزن بالـــكـجـم</div>

  <!-- MAIN TABLE -->
  <table class="main-table">
    <thead>
      <tr>
        <th>Item</th>
        <th>Net weight<br>carton</th>
        <th>Total Net<br>weight</th>
        <th>Gross<br>Weight</th>
        <th>Total Gross<br>Weight</th>
        <th>Number of<br>units</th>
        <th>carton<br>number</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td>Total</td>
        <td></td>
        <td>${totalNet.toFixed(2)}</td>
        <td></td>
        <td>${totalGross.toFixed(2)}</td>
        <td></td>
        <td>${totalCartons.toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>

  <!-- FOOTER -->
  <table class="footer-table">
    <tr>
      <td colspan="3">Addres: &nbsp; 90 Cairo-Alexandria Agricultural Road</td>
    </tr>
    <tr>
      <td>TEL: &nbsp; 00201557086493 &nbsp;-&nbsp; 0020403284429</td>
      <td>E-mail: &nbsp; Export.elnour@gmail.com</td>
      <td>Web site: &nbsp; www.eggulf.com</td>
    </tr>
  </table>

  <script>window.onload = () => window.print();<\/script>
  </body></html>`);
    win.document.close();
}
