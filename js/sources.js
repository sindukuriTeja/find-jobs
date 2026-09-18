/* FindJobs — client-side job sources.
 * All endpoints are public and CORS-enabled (verified 2026-09):
 *   remoteok.com/api, remotive.com/api/remote-jobs, arbeitnow.com/api/job-board-api,
 *   boards-api.greenhouse.io, api.ashbyhq.com/posting-api
 * No API keys, no backend. In-memory TTL cache (10 min).
 */
(function () {
  'use strict';
  const TTL = 10 * 60 * 1000;
  const cache = new Map();
  const SKILLS = ['python', 'java', 'javascript', 'typescript', 'react', 'angular', 'vue', 'node', 'node.js', 'sql', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'machine learning', 'deep learning', 'data science', 'llm', 'ai', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'graphql', 'rest', 'api', 'microservices', 'git', 'agile', 'postgresql', 'mongodb', 'redis', 'linux', 'figma', 'cypress', 'playwright', 'selenium', 'security', 'golang', 'rust', 'php', 'ruby', 'scala', 'spark', 'kafka'];

  function decode(s) {
    return String(s).replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
  }
  function clean(v = '') {
    let s = decode(decode(String(v)));
    return s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function iso(v) { const d = new Date(v || Date.now()); return isNaN(d) ? new Date().toISOString() : d.toISOString(); }
  function mode(loc = '', remote = false) { let s = (loc + '').toLowerCase(); return remote || s.includes('remote') ? 'remote' : s.includes('hybrid') ? 'hybrid' : s ? 'onsite' : 'unknown'; }
  function type(v = '') { v = Array.isArray(v) ? v.join(' ') : String(v).toLowerCase(); return /intern/.test(v) ? 'internship' : /contract|freelance|temporary/.test(v) ? 'contract' : /part/.test(v) ? 'part_time' : /full|permanent/.test(v) ? 'full_time' : 'unknown'; }
  function exp(title = '', text = '') {
    if (/intern|fresher|junior|entry[- ]level|graduate|trainee/.test(title)) return 'fresher';
    if (/senior|staff|principal|lead\b/.test(title)) return 'senior';
    if (/intern|fresher|junior|entry[- ]level/.test(text)) return 'fresher';
    if (/senior|staff|principal/.test(text)) return 'senior';
    return 'mid';
  }
  function category(title = '', text = '') {
    const rules = [['Machine Learning', /machine learning|deep learning|\bml engineer|\bml\b/], ['AI', /\bai\b|llm|artificial intelligence|generative/], ['Security', /security|cyber|infosec|threat|fraud/], ['QA', /\bqa\b|quality assurance/], ['Testing', /test automation|\btesting\b|cypress|playwright/], ['Frontend', /frontend|front end|\breact\b|\bvue\b|angular|\bcss\b/], ['Backend', /backend|back end|\bapi\b|database|\bsql\b/], ['DevOps', /devops|\bsre\b|kubernetes|terraform|\bcloud\b/], ['Data', /data (analyst|scientist|engineer)|analytics|\bbi\b/], ['Design', /\bdesign(er)?\b|figma|\bux\b|\bui\b/], ['Product', /product manager|\bpm\b|product owner/], ['Management', /manager|management|scrum/], ['Finance', /finance|accounting|fintech/], ['Legal', /legal|lawyer|compliance/], ['Support', /support|customer success/], ['Education', /education|teacher|learning/], ['Community', /community|developer relations/]];
    const hit = (t) => { for (const r of rules) if (r[1].test(t)) return r[0]; return null; };
    return hit(title) || hit(text) || 'Other';
  }
  function norm(source, o) {
    const desc = clean(o.description || o.content || o.descriptionHtml || o.descriptionPlain || '');
    const title = o.title || o.position || '';
    const tags = [...(o.tags || [])].map(clean);
    const meta = Array.isArray(o.metadata) ? o.metadata.join(' ') : (Array.isArray(o.departments) ? o.departments.map(d => d.name || d).join(' ') : '');
    const full = (title + ' ' + tags.join(' ') + ' ' + meta + ' ' + desc).toLowerCase();
    let loc = o.location?.name || o.location || o.candidate_required_location || '';
    let remote = o.remote === true || o.isRemote === true;
    let id = o.id || o.slug;
    return {
      id: `${source}-${id}`, source, title,
      company: o.company || o.company_name || source,
      location: loc || (remote ? 'Remote' : 'Not specified'),
      work_mode: mode(loc, remote),
      job_type: type(o.job_type || o.job_types || o.employmentType),
      experience: exp(title, full),
      category: category(title, full),
      skills: [...new Set([...tags, ...SKILLS.filter(s => full.includes(s))])].slice(0, 15),
      salary: o.salary || ((o.salary_min || o.salary_max) ? `${o.salary_min || ''}${o.salary_min && o.salary_max ? ' – ' : ''}${o.salary_max || ''}` : null),
      posted_at: iso(o.date || o.publication_date || o.created_at || o.updated_at || o.publishedAt || o.first_published),
      url: o.url || o.absolute_url || o.jobUrl || o.apply_url || o.applyUrl || '',
      apply_url: o.apply_url || o.applyUrl || o.absolute_url || o.jobUrl || o.url || '',
      description: desc
    };
  }
  async function get(url, opts = {}) {
    let c = new AbortController();
    let t = setTimeout(() => c.abort(), 15000);
    try {
      let r = await fetch(url, { ...opts, signal: c.signal, headers: { 'Accept': 'application/json', ...(opts.headers || {}) } });
      if (!r.ok) throw Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // --- source fetchers (list) ---
  const GREENHOUSE_BOARDS = ['stripe', 'airbnb', 'vercel', 'notion'];
  const ASHBY_BOARDS = ['ramp', 'ashby', 'linear'];

  async function remoteok() {
    const d = await get('https://remoteok.com/api');
    return d.filter(x => x.id).map(x => norm('remoteok', x));
  }
  async function remotive() {
    const d = await get('https://remotive.com/api/remote-jobs');
    return d.jobs.map(x => norm('remotive', x));
  }
  async function arbeitnow(q = '') {
    const d = await get('https://www.arbeitnow.com/api/job-board-api?search=' + encodeURIComponent(q) + '&page=1');
    return d.data.map(x => norm('arbeitnow', x));
  }
  // List WITHOUT content (417KB vs 5MB); description filled on detail fetch.
  async function greenhouse() {
    const rs = await Promise.allSettled(GREENHOUSE_BOARDS.map(b =>
      get(`https://boards-api.greenhouse.io/v1/boards/${b}/jobs`).then(x => x.jobs.map(j => { const n = norm('greenhouse', { ...j, company_name: j.company_name || b }); n.id = `greenhouse-${b}-${j.id}`; return n; }))))
    return rs.filter(x => x.status === 'fulfilled').flatMap(x => x.value);
  }
  async function ashby() {
    const rs = await Promise.allSettled(ASHBY_BOARDS.map(b =>
      get(`https://api.ashbyhq.com/posting-api/job-board/${b}`).then(x => (x.jobs || []).map(j => { const n = norm('ashby', { ...j, company_name: b, remote: j.isRemote }); n.id = `ashby-${b}-${j.id}`; return n; }))))
    return rs.filter(x => x.status === 'fulfilled').flatMap(x => x.value);
  }

  const fns = { remoteok, remotive, arbeitnow, greenhouse, ashby };
  const SOURCES = Object.keys(fns);

  async function loadSource(name, q) {
    let key = name + (name === 'arbeitnow' ? ':' + q : '');
    let old = cache.get(key);
    if (old && Date.now() - old.at < TTL) return { jobs: old.jobs, cached: true };
    let jobs = await fns[name](q);
    cache.set(key, { at: Date.now(), jobs });
    return { jobs, cached: false };
  }

  // --- detail fetchers ---
  // rawId is the part of the job id after the source prefix:
  //   greenhouse: "stripe-8172487"   (board + numeric id)
  //   ashby:      "ramp-<uuid>"      (board + uuid)
  //   others:     the raw source id
  async function detail(source, rawId) {
    if (source === 'greenhouse') {
      let i = rawId.lastIndexOf('-');
      let board = rawId.slice(0, i), id = rawId.slice(i + 1);
      let j = await get(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`);
      let n = norm('greenhouse', { ...j, company_name: j.company_name || board });
      n.id = `greenhouse-${board}-${id}`;
      return n;
    }
    let { jobs } = await loadSource(source);
    let j = jobs.find(x => x.id === `${source}-${rawId}`);
    if (!j) throw Error('Job no longer available');
    return j;
  }

  window.JobSources = { SOURCES, loadSource, detail, norm, cache, TTL };
})();