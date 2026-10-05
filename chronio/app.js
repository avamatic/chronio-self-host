const $ = id => document.getElementById(id);
let key, token, revision = 0, loadedProfile, configuration;
const status = text => { $('status').textContent = text; };
async function request(path, body, authenticated = true) {
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type':'application/json', apikey:key, Authorization:`Bearer ${authenticated ? token : key}`}, body: JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.msg || data.error_description || data.error || `HTTP ${response.status}`);
  return data;
}
const rpc = (name, body) => request(`/rest/v1/rpc/${name}`, body);
function addDisabled(ref = {}) {
  const row = document.createElement('div'); row.className = 'row';
  for (const [field, label] of [['sourceUrl','Source URL'],['id','Playlist id']]) {
    const input = document.createElement('input'); input.dataset.field = field; input.setAttribute('aria-label',label); input.placeholder = label; input.value = ref[field] || ''; row.append(input);
  }
  const button = document.createElement('button'); button.textContent = 'Remove'; button.onclick = () => row.remove(); row.append(button); $('disabled').append(row);
}
async function load() {
  loadedProfile = undefined; $('save').disabled = true;
  const profileId = Number($('profile').value);
  const rows = await rpc('sync_pull_playlist_configuration', {p_profile_id:profileId});
  configuration = rows[0]?.configuration || {version:1,sources:[],disabledPlaylists:[]};
  if (configuration.version !== 1) throw new Error('This configuration requires a newer Chronio editor.');
  revision = rows[0]?.revision || 0;
  $('sources').value = configuration.sources.join('\n'); $('disabled').replaceChildren(); configuration.disabledPlaylists.forEach(addDisabled);
  loadedProfile = profileId; $('save').disabled = false; status(`Loaded revision ${revision}.`);
}
function action(fn) { return async () => { try { await fn(); } catch (error) { status(error.message); } }; }
$('login').onsubmit = async event => {
  event.preventDefault();
  await action(async () => {
    const discovery = await (await fetch('/.well-known/nuvio')).json(); key = discovery.publishable_key;
    const session = await request('/auth/v1/token?grant_type=password', {email:$('email').value,password:$('password').value}, false); token = session.access_token; $('password').value = '';
    const profiles = await rpc('sync_pull_profiles', {}); $('profile').replaceChildren();
    profiles.forEach(profile => { const option = document.createElement('option'); option.value = profile.profile_index; option.textContent = profile.name || `Profile ${profile.profile_index}`; $('profile').append(option); });
    $('login').hidden = true; $('editor').hidden = false; await load();
  })();
};
$('profile').onchange = action(load); $('reload').onclick = action(load); $('add').onclick = () => addDisabled();
$('logout').onclick = () => { token = undefined; configuration = undefined; $('editor').hidden = true; $('login').hidden = false; status('Signed out of the playlist editor.'); };
$('save').onclick = action(async () => {
  if (loadedProfile !== Number($('profile').value)) throw new Error('Reload this profile before saving.');
  const sources = $('sources').value.split('\n').map(s => s.trim()).filter(Boolean);
  const disabledPlaylists = [...$('disabled').children].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.field,input.value.trim()])));
  await rpc('sync_push_playlist_configuration', {p_profile_id:loadedProfile,p_expected_revision:revision,p_configuration:{...configuration,version:1,sources,disabledPlaylists}});
  await load(); status(`Saved revision ${revision}. Connected TVs synchronize within a minute.`);
});
