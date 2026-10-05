// Injected into the pinned dashboard's React module by brand.mjs.
// Use its authenticated request helper so session refresh and sign-out stay shared.
function ChronioPlaylistEditor({React, request, profileId, profileName}) {
  const h = React.createElement;
  const [saved, setSaved] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [revision, setRevision] = React.useState(0);
  const [url, setUrl] = React.useState('');
  const [indexes, setIndexes] = React.useState({});
  const [epoch, setEpoch] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('Loading playlist configuration…');
  const operation = React.useRef(0);
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const rpc = (name, body) => request(`/rest/v1/rpc/${name}`, body);
  const accept = row => {
    const value = row?.configuration || {version:1, sources:[], disabledPlaylists:[]};
    if (value.version !== 1) throw new Error('This configuration requires a newer Chronio editor.');
    setSaved(value); setDraft(value); setRevision(row?.revision || 0);
  };
  async function load() {
    const current = ++operation.current;
    setBusy(true);
    try {
      const rows = await rpc('sync_pull_playlist_configuration', {p_profile_id:profileId});
      if (current !== operation.current) return;
      accept(rows[0]); setMessage('Configuration is up to date.');
    } catch (error) {
      if (current === operation.current) setMessage(error.message);
    } finally { if (current === operation.current) setBusy(false); }
  }
  React.useEffect(() => {
    load();
    return () => { ++operation.current; };
  }, [profileId]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const sourcesKey = JSON.stringify(draft?.sources || []);
  React.useEffect(() => {
    let cancelled = false;
    const controllers = [];
    for (const source of JSON.parse(sourcesKey)) {
      const controller = new AbortController();
      controllers.push(controller);
      (async () => {
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          // Never send account credentials to a publisher.
          const response = await fetch(source, {credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal});
          if (!response.ok) throw new Error(`Publisher returned HTTP ${response.status}.`);
          const text = await response.text();
          if (text.length > 2 * 1024 * 1024) throw new Error('Playlist index is too large.');
          const index = JSON.parse(text);
          if (index.format !== 'playlist-index' || index.version !== 1 || !Array.isArray(index.playlists)) {
            throw new Error('The source must provide a version 1 playlist index.');
          }
          const ids = new Set();
          for (const item of index.playlists) {
            if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('The index has invalid playlist identities.');
            ids.add(item.id);
          }
          if (!cancelled) setIndexes(previous => ({...previous, [source]:{index}}));
        } catch (error) {
          if (!cancelled) setIndexes(previous => ({...previous, [source]:{...previous[source], error:controller.signal.aborted ? 'The publisher did not respond in time.' : error.message || 'Cannot read this source. Check its URL and browser access (CORS).'}}));
        } finally { clearTimeout(timeout); }
      })();
    }
    return () => { cancelled = true; controllers.forEach(controller => controller.abort()); };
  }, [sourcesKey, epoch]);
  function edit(value) { setDraft(value); setMessage('Unsaved changes'); }
  function add(event) {
    event.preventDefault();
    try {
      const source = url.trim(); const parsed = new URL(source);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an HTTP or HTTPS index URL.');
      if (draft.sources.includes(source)) throw new Error('This source is already added.');
      if (draft.sources.length >= 100) throw new Error('You can configure up to 100 sources.');
      edit({...draft, sources:[...draft.sources, source]}); setUrl('');
    } catch (error) { setMessage(error.message); }
  }
  function remove(source) {
    edit({...draft, sources:draft.sources.filter(item => item !== source),
      disabledPlaylists:draft.disabledPlaylists.filter(item => item.sourceUrl !== source)});
  }
  function move(position, delta) {
    const sources = [...draft.sources];
    [sources[position], sources[position+delta]] = [sources[position+delta], sources[position]];
    edit({...draft, sources});
  }
  function toggle(sourceUrl, id, enabled) {
    const disabledPlaylists = draft.disabledPlaylists.filter(item => !(item.sourceUrl === sourceUrl && item.id === id));
    if (!enabled) disabledPlaylists.push({sourceUrl, id});
    edit({...draft, disabledPlaylists});
  }
  async function save() {
    const current = ++operation.current;
    setBusy(true);
    try {
      const rows = await rpc('sync_push_playlist_configuration', {p_profile_id:profileId, p_configuration:draft, p_expected_revision:revision});
      if (current !== operation.current) return;
      accept(rows[0]); setMessage('Saved. Connected TVs synchronize within a minute.');
    } catch (error) {
      if (current === operation.current) setMessage(error.status === 409
        ? 'Another device changed this configuration. Your edits are still here. Reload to review the latest version before saving.'
        : error.message);
    } finally { if (current === operation.current) setBusy(false); }
  }
  const button = (label, onClick, disabled = false, extra = {}) => h('button', {type:'button', className:'btn btn-outline btn-xs', onClick, disabled:busy || disabled, ...extra}, label);
  const enabled = (source, id) => !draft.disabledPlaylists.some(item => item.sourceUrl === source && item.id === id);
  return h('div', {className:'chronio-playlists'},
    h('style', null, `.chronio-playlists{display:grid;gap:24px}.cp-heading,.cp-actions,.cp-source-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.cp-heading h1{font-size:24px;font-weight:700;letter-spacing:-.025em}.cp-muted{font-size:14px;opacity:.55;line-height:1.6}.cp-add{display:flex;gap:10px;flex-wrap:wrap}.cp-input{flex:1;min-width:200px;padding:12px 14px;border:1px solid #8884;border-radius:12px;background:transparent;color:inherit;font:inherit;outline-offset:3px}.cp-card{border-radius:16px;border:1px solid #8883;padding:22px;display:grid;gap:18px}.cp-source-heading h2{font-size:17px;font-weight:600}.cp-url{font-size:12px;opacity:.55;overflow-wrap:anywhere}.cp-list{display:grid;gap:10px}.cp-item{display:flex;align-items:center;gap:14px;border-radius:12px;padding:14px;background:#8881}.cp-item input{width:19px;height:19px;accent-color:#ed726f;flex-shrink:0}.cp-item img{width:92px;height:52px;border-radius:7px;object-fit:cover}.cp-item-text{flex:1;min-width:0}.cp-item-title{font-size:14px;font-weight:600}.cp-item-detail{font-size:12px;opacity:.55}.cp-feedback{font-size:14px;line-height:1.6;overflow-wrap:anywhere}.cp-empty{padding:34px 22px;text-align:center;border:1px dashed #8884;border-radius:16px}.cp-top{display:grid;gap:18px}.cp-footer{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.cp-save{background:linear-gradient(110deg,#ffb23f,#ff5e62,#c04bff);color:#171717;border:0;border-radius:999px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer}.cp-save:disabled{opacity:.4;cursor:default}@media(max-width:600px){.cp-item img{display:none}.cp-card{padding:16px}.cp-add .cp-input{width:100%;flex-basis:100%}}`),
    h('div', {className:'cp-heading'},
      h('div', null, h('h1', null, 'Playlists'), h('p', {className:'cp-muted'}, `${profileName || `Profile ${profileId}`} · Playlist sources and selections synced with Chronio TV.`)),
      h('div', {className:'cp-actions'}, button('Refresh playlists', () => setEpoch(value => value+1), !draft), button('Reload configuration', () => { if (!dirty || window.confirm('Discard unsaved playlist changes and reload?')) load(); }))),
    draft && h('div', {className:'cp-top'},
      h('form', {className:'cp-add', onSubmit:add}, h('input', {className:'cp-input', type:'url', value:url, disabled:busy, onChange:event=>setUrl(event.target.value), placeholder:'https://your-playlist-host/v1/index.json', 'aria-label':'Playlist source URL', required:true}),
        h('button', {type:'submit', className:'btn btn-primary', disabled:busy}, 'Add source')),
      !draft.sources.length && h('div', {className:'cp-empty'}, h('p', null, 'No playlist sources yet'), h('p', {className:'cp-muted'}, 'Add an index URL to choose which playlists appear on your TV.')),
      draft.sources.map((source, position) => {
        const entry = indexes[source];
        const listed = entry?.index?.playlists || [];
        const unknown = draft.disabledPlaylists.filter(item => item.sourceUrl === source && !listed.some(playlist => playlist.id === item.id));
        return h('section', {className:'cp-card', key:source},
          h('div', {className:'cp-source-heading'}, h('div', null, h('h2', null, entry?.index?.name || `Source ${position+1}`), h('p', {className:'cp-url'}, source)),
            h('div', {className:'cp-actions'}, button('↑', ()=>move(position,-1), position===0, {'aria-label':`Move source ${position+1} up`}), button('↓', ()=>move(position,1), position===draft.sources.length-1, {'aria-label':`Move source ${position+1} down`}), button('Remove source', ()=>remove(source)))),
          entry?.error && h('p', {className:'cp-feedback', role:'status'}, `${entry.error} Your selections are retained. Publishers must allow browser access to show playlist names.`),
          !entry && h('p', {className:'cp-muted'}, 'Loading playlists…'),
          h('div', {className:'cp-list'}, [...listed, ...unknown.map(item => ({id:item.id, name:item.id, description:'Disabled playlist not listed in the current index'}))].map(playlist => {
            let poster;
            try { const parsed = new URL(playlist.poster, source); if (playlist.poster && ['http:','https:'].includes(parsed.protocol)) poster=parsed.href; } catch {}
            return h('label', {className:'cp-item', key:playlist.id},
              h('input', {type:'checkbox', checked:enabled(source,playlist.id), disabled:busy, onChange:event=>toggle(source,playlist.id,event.target.checked), 'aria-label':`Enable ${playlist.name || playlist.id}`}),
              poster && h('img', {src:poster, alt:'', loading:'lazy', referrerPolicy:'no-referrer'}),
              h('div', {className:'cp-item-text'}, h('p', {className:'cp-item-title'}, playlist.name || playlist.id), h('p', {className:'cp-item-detail'}, [Number.isFinite(playlist.entries) ? `${playlist.entries} entries` : '', playlist.description].filter(Boolean).join(' · '))));
          })),
          entry?.index && !listed.length && h('p', {className:'cp-muted'}, 'This source currently lists no playlists.'));
      }),
      h('div', {className:'cp-footer'}, h('button', {type:'button', className:'cp-save', onClick:save, disabled:busy || !dirty}, busy ? 'Saving…' : 'Save changes'), h('span', {className:'cp-muted'}, dirty ? 'Unsaved changes' : `Saved revision ${revision}`))),
    h('p', {className:'cp-feedback', role:'status', 'aria-live':'polite'}, message));
}
