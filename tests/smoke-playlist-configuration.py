#!/usr/bin/env python3
"""Run against a disposable deployment or production with disposable test accounts.

The test creates two accounts and removes only those accounts in finally.
Requires CHRONIO_URL and CHRONIO_SERVICE_ROLE_KEY for cleanup. No secrets print.
"""
import json, os, secrets, urllib.request, urllib.error

base = os.environ['CHRONIO_URL'].rstrip('/')
admin = os.environ['CHRONIO_SERVICE_ROLE_KEY']
users = []

def request(path, data=None, token=None, method=None, expected=200):
    headers = {'Content-Type':'application/json', 'apikey':key, 'Authorization':'Bearer '+(token or key)}
    req = urllib.request.Request(base+path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=40)
        status, payload = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, payload = error.code, error.read()
    if status != expected:
        raise AssertionError(f'{path}: expected HTTP {expected}, got {status}: {payload[:500].decode()}')
    return json.loads(payload) if payload else None

key = json.load(urllib.request.urlopen(base+'/.well-known/nuvio'))['publishable_key']

def rpc(name, data, token=None, expected=200):
    return request('/rest/v1/rpc/'+name, data, token, expected=expected)

try:
    sessions=[]
    for _ in range(2):
        password=secrets.token_urlsafe(24)
        email='chronio-smoke-'+secrets.token_hex(8)+'@example.invalid'
        session=request('/auth/v1/signup', {'email':email,'password':password})
        users.append(session['user']['id'])
        session=request('/auth/v1/token?grant_type=password', {'email':email,'password':password})
        sessions.append(session)
    token=sessions[0]['access_token'];other=sessions[1]['access_token']
    profiles=rpc('sync_pull_profiles',{},token)
    assert any(p['profile_index']==1 for p in profiles)
    refreshed=request('/auth/v1/token?grant_type=refresh_token',{'refresh_token':sessions[0]['refresh_token']})
    token=refreshed['access_token']
    print('PASS account signup, password login, refresh and primary profile')

    rpc('sync_push_addons',{'p_profile_id':1,'p_addons':[{'url':'https://example.invalid/addon','sort_order':0,'enabled':True}], 'p_origin_client_id':'chronio-smoke'},token)
    addons=request('/rest/v1/addons?select=url,enabled,sort_order&profile_id=eq.1',token=token)
    assert len(addons)==1 and addons[0]['url']=='https://example.invalid/addon'
    print('PASS addon account round trip')

    empty={'version':1,'sources':[],'disabledPlaylists':[]}
    source=base.replace('chronio-self-host','chronio-playlist')+'/v1/index.json'
    config={'version':1,'sources':[source], 'disabledPlaylists':[{'sourceUrl':source,'id':'star-trek'}], 'x-client-hint':'preserve'}
    assert rpc('sync_pull_playlist_configuration',{'p_profile_id':1},token)==[]
    saved=rpc('sync_push_playlist_configuration',{'p_profile_id':1,'p_configuration':config,'p_expected_revision':0},token)[0]
    assert saved['revision']==1 and saved['configuration']==config
    assert rpc('sync_pull_playlist_configuration',{'p_profile_id':1},token)[0]['configuration']==config
    assert rpc('sync_pull_playlist_configuration',{'p_profile_id':1},other)==[]
    rpc('sync_push_playlist_configuration',{'p_profile_id':1,'p_configuration':empty,'p_expected_revision':0},token,409)
    print('PASS playlist create, pull, account isolation and stale-write rejection')

    invalid=[{**empty,'sources':[source,source]}, {**empty,'version':2}, {**empty,'sources':['file:///tmp/source']}, {**empty,'disabledPlaylists':[{'sourceUrl':source,'id':'missing-source'}]}]
    for value in invalid:
        rpc('sync_push_playlist_configuration',{'p_profile_id':1,'p_configuration':value,'p_expected_revision':1},token,400)
    rpc('sync_pull_playlist_configuration',{'p_profile_id':1},expected=401)
    saved=rpc('sync_push_playlist_configuration',{'p_profile_id':1,'p_configuration':empty,'p_expected_revision':1},token)[0]
    assert saved['revision']==2 and saved['configuration']==empty
    print('PASS configuration validation, anonymous denial and explicit empty configuration')

    rpc('sync_push_profiles', {'p_profiles':[{'profile_index':1,'name':'Primary','avatar_color_hex':'#336699','uses_primary_addons':False,'uses_primary_plugins':False},{'profile_index':2,'name':'Secondary','avatar_color_hex':'#336699','uses_primary_addons':False,'uses_primary_plugins':False}], 'p_client_max_profiles':6,'p_origin_client_id':'chronio-smoke'},token)
    rpc('sync_push_playlist_configuration',{'p_profile_id':2,'p_configuration':config,'p_expected_revision':0},token)
    assert rpc('sync_pull_playlist_configuration',{'p_profile_id':1},token)[0]['configuration']==empty
    rpc('sync_delete_profile_data',{'p_profile_id':2},token)
    assert rpc('sync_pull_playlist_configuration',{'p_profile_id':2},token)==[]
    print('PASS profile isolation and deletion cascade')

    nonce=secrets.token_hex(24)
    tv=rpc('start_tv_login_session',{'p_device_nonce':nonce,'p_redirect_base_url':base+'/tv-login','p_device_name':'Chronio test TV'})[0]
    approved=rpc('approve_tv_login_session',{'p_code':tv['code']},token)
    assert approved[0]['success']
    exchange=request('/functions/v1/tv-logins-exchange',{'code':tv['code'],'device_nonce':nonce})
    assert exchange['access_token'] and exchange['refresh_token']
    assert request('/auth/v1/user',token=exchange['access_token'])['id']==users[0]
    print('PASS TV QR login start, approval, exchange and authenticated session')
finally:
    for user in users:
        request('/auth/v1/admin/users/'+user,token=admin,method='DELETE')
    print('Removed disposable smoke-test accounts.')
