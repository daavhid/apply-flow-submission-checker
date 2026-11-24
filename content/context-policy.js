/* Shared by the service worker, content scripts, and contract tests. */
(function (root) {
  'use strict';
  function origin(value) {
    const u = new URL(value);
    if (u.username || u.password || u.pathname !== '/' || u.search || u.hash ||
        (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))) {
      throw new Error('Use an HTTPS ApplyFlow origin (HTTP is allowed for localhost only).');
    }
    return u.origin;
  }
  function matchesUrl(value, routes) {
    try {
      const u = new URL(value);
      if (!['https:', 'http:'].includes(u.protocol)) return false;
      return (routes || []).some(route => {
        const target = new URL(route.url);
        if (target.origin !== u.origin || target.username || target.password) return false;
        const path = target.pathname.replace(/\/$/, '') || '/';
        const actual = u.pathname.replace(/\/$/, '') || '/';
        const pathMatch = route.includeSubpaths === true && path !== '/'
          ? actual === path || actual.startsWith(path + '/') : actual === path;
        // Preserve job-identifying query parameters. Extra tracking parameters are allowed.
        return pathMatch && [...target.searchParams].every(([key, val]) => u.searchParams.get(key) === val);
      });
    } catch (_) { return false; }
  }
  function launchHints(url) {
      const u = new URL(url);
      const hash = u.hash.slice(1);
      const hp = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash);
      const get = key => hp.get('sqc_' + key) || hp.get(key) || u.searchParams.get('sqc_' + key) || undefined;
      return { applicationSessionId: get('application_session_id') || u.searchParams.get('application_session_id') || undefined,
        jobId: get('job_id'), profileId: get('profile_id') };
  }
  // Observed pages are recorded only after the backend verifies the application's
  // identity. They are not a list of permitted future redirect destinations.
  function matchesContext(value, context) {
    if(Array.isArray(context?.verifiedUrls))return context.verifiedUrls.includes(value);
    return matchesUrl(value,context?.allowedRoutes);
  }
  function duplicate(context) {
    const positive=value=>['APPLIED','SUBMITTED','ALREADY_APPLIED'].includes(String(value||'').toUpperCase());
    const profile=context?.profile,job=context?.job;
    if(!profile?.id||!job?.id)return null;
    if(positive(context.status))return {confirmed:true,profileId:profile.id,jobId:job.id,title:job.title,company:job.company,status:context.status,source:'current-record'};
    const check=context.duplicateCheck,match=check?.matchedJob,record=check?.submission;
    const norm=value=>String(value||'').toLowerCase().replace(/\s+/g,' ').trim();
    if(check?.status!=='ALREADY_APPLIED'||check.profileId!==profile.id||!positive(record?.status)||!record?.id||!match?.id||
      !norm(job.title)||!norm(job.company)||norm(match.title)!==norm(job.title)||norm(match.company)!==norm(job.company))return null;
    for(const field of ['requisitionId','location'])if(job[field]&&match[field]&&norm(job[field])!==norm(match[field]))return null;
    return {confirmed:true,profileId:profile.id,jobId:job.id,title:match.title,company:match.company,status:record.status,
      matchedJobId:match.id,recordId:record.id,submittedAt:record.submittedAt,applierName:record.applierName,source:'candidate-history'};
  }
  function ready(settings, url, now = Date.now()) {
    const c = settings?.verifiedContext;
    try {
      const hints = launchHints(url);
      for (const [key, expected] of [['applicationSessionId', c?.applicationSessionId], ['profileId', c?.profileId], ['jobId', c?.jobId]]) {
        const hint = hints[key];
        if (hint && hint !== expected) return false;
      }
    } catch (_) { return false; }
    return Boolean(settings?.integrationMode === 'applyflow' && c && c.state === 'VERIFIED' &&
      c.applicationSessionId && c.applierId && c.profileId && c.jobId &&
      c.profileAssignmentId && c.profileAssignmentVersion &&
      Number(c.expiresAt) > now && matchesContext(url, c));
  }
  const api = { origin, matchesUrl, matchesContext, duplicate, ready, launchHints };
  root.SQCContextPolicy = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
