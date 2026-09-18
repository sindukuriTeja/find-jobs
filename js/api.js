/* FindJobs — client-side aggregator.
 * Replaces the old /api/jobs and /api/job serverless endpoints.
 * Same response shape, so the UI (js/app.js) is unchanged.
 */
(function () {
  'use strict';
  const PAGE = 30;

  async function jobs(params = {}) {
    const names = params.source ? [params.source] : window.JobSources.SOURCES;
    const q = (params.q || '').toLowerCase();
    let outcomes = await Promise.all(names.map(async (n) => {
      const st = Date.now();
      try {
        const x = await window.JobSources.loadSource(n, params.q || '');
        return [n, { ok: true, count: x.jobs.length, ms: Date.now() - st, cached: x.cached }, x.jobs];
      } catch (e) {
        return [n, { ok: false, count: 0, ms: Date.now() - st, error: e.message }, []];
      }
    }));
    const sources = {};
    let all = [];
    let cached = true;
    outcomes.forEach(([n, s, j]) => { sources[n] = s; cached &&= !!s.cached; all.push(...j); });

    const loc = (params.location || '').toLowerCase();
    all = all
      .filter(j => !q || `${j.title} ${j.company} ${j.skills.join(' ')} ${j.description}`.toLowerCase().includes(q))
      .filter(j => !loc || j.location.toLowerCase().includes(loc))
      .filter(j => !params.category || j.category === params.category)
      .filter(j => !params.work_mode || j.work_mode === params.work_mode)
      .filter(j => !params.job_type || j.job_type === params.job_type)
      .filter(j => !params.experience || j.experience === params.experience);
    all = [...new Map(all.map(j => [j.id, j])).values()];

    if (params.sort === 'relevance') {
      const p = JSON.parse(localStorage.getItem('findjobs-profile') || 'null');
      if (p) {
        all = all.map(j => ({ ...j, _score: window.JobMatcher.calculateMatchScore(j, p).match_percentage }))
          .sort((a, b) => b._score - a._score);
        all = all.map(({ _score, ...j }) => j);
      } else {
        all.sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at));
      }
    } else {
      all.sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at));
    }

    const total = all.length;
    const limit = Math.min(Math.max(+params.limit || PAGE, 1), 100);
    const page = Math.max(+params.page || 1, 1);
    return { jobs: all.slice((page - 1) * limit, page * limit), total, sources, cached, generated_at: new Date().toISOString() };
  }

  async function job(source, rawId) {
    const j = await window.JobSources.detail(source, rawId);
    return { job: j };
  }

  window.JobAPI = { jobs, job };
})();