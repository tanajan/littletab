import os
import sys
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['DATABASE_URL'] = os.environ.get('TEST_DATABASE_URL', 'sqlite:///./test-littletab.db')
from app import app, Base, engine, Session, Room, Access, utcnow, purge

@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def create(client):
    r = client.post('/api/rooms', json={'name':'Weekend','password':'0123','creator':'Alex','currency':'GBP'})
    assert r.status_code == 201, r.text
    return r.json()

def auth(s):
    return {'Authorization': 'Bearer ' + s['token']}

def test_create_join_edit_conflict_delete(client):
    owner = create(client)
    code = owner['room']['code']
    assert len(code) == 5 and code.isdigit()
    assert client.get(f'/api/rooms/{code}').status_code == 401
    assert client.post(f'/api/rooms/{code}/join',json={'password':'9999'}).status_code == 401
    guest = client.post(f'/api/rooms/{code}/join',json={'password':'0123'}).json()
    data = owner['room']
    data['people'].append({'id':'sam','name':'Sam'})
    data['items'] = [{'id':'food','name':'Dinner','amount':2001,'paidBy':data['people'][0]['id'],'participants':[p['id'] for p in data['people']]}]
    updated = client.put(f'/api/rooms/{code}',json=data,headers=auth(guest))
    assert updated.status_code == 200, updated.text
    assert updated.json()['version'] == 2
    assert client.get(f'/api/rooms/{code}',headers=auth(owner)).json()['items'][0]['amount'] == 2001
    assert client.put(f'/api/rooms/{code}',json=data,headers=auth(owner)).status_code == 409
    assert client.delete(f'/api/rooms/{code}',headers=auth(guest)).status_code == 403
    assert client.delete(f'/api/rooms/{code}',headers={**auth(owner),'X-Owner-Token':owner['ownerToken']}).status_code == 204
    assert client.get(f'/api/rooms/{code}',headers=auth(guest)).status_code == 401

def test_expiry_physically_removes_room_and_sessions(client):
    s = create(client)
    with Session.begin() as db:
        db.get(Room,s['room']['code']).expires_at = utcnow()-timedelta(seconds=1)
    assert client.get(f"/api/rooms/{s['room']['code']}",headers=auth(s)).status_code == 404
    purge()
    with Session() as db:
        assert db.query(Room).count() == 0
        assert db.query(Access).count() == 0

def test_validation_and_password_hashing(client):
    s = create(client)
    with Session() as db:
        stored = db.get(Room,s['room']['code'])
        assert '0123' not in stored.password_hash
        assert s['ownerToken'] != stored.owner_hash
    data = s['room']
    data['items'] = [{'id':'x','name':'Food','amount':1,'paidBy':'outsider','participants':['outsider']}]
    assert client.put(f"/api/rooms/{data['code']}",json=data,headers=auth(s)).status_code == 422
    data['items'] = [{'id':'x','name':'Food','amount':-10,'paidBy':data['people'][0]['id'],'participants':[]}]
    assert client.put(f"/api/rooms/{data['code']}",json=data,headers=auth(s)).status_code == 422

def test_password_attempts_are_limited(client):
    s = create(client)
    for _ in range(10):
        assert client.post(f"/api/rooms/{s['room']['code']}/join",json={'password':'9999'}).status_code == 401
    assert client.post(f"/api/rooms/{s['room']['code']}/join",json={'password':'9999'}).status_code == 429

def test_session_is_scoped_to_one_room(client):
    one, two = create(client), create(client)
    assert client.get(f"/api/rooms/{two['room']['code']}",headers=auth(one)).status_code == 401

def test_successful_joins_do_not_lock_out_the_group(client):
    s = create(client)
    for _ in range(12):
        assert client.post(f"/api/rooms/{s['room']['code']}/join",json={'password':'0123'}).status_code == 200

def test_blank_room_names_are_rejected(client):
    assert client.post('/api/rooms',json={'name':'   ','creator':'Alex','password':'0123'}).status_code == 422

def test_room_pin_is_exactly_four_ascii_digits(client):
    for invalid in ['123', '12345', 'abcd', '12 3', '１２３４']:
        assert client.post('/api/rooms',json={'name':'Dinner','creator':'Alex','password':invalid}).status_code == 422
    s = create(client)
    assert client.post(f"/api/rooms/{s['room']['code']}/join",json={'password':'0123'}).status_code == 200

def test_guest_picks_host_created_person_without_duplicating_expenses(client):
    host = create(client)
    data = host['room']
    code = data['code']
    data['people'].append({'id':'jamie','name':'Jamie'})
    data['items'] = [{'id':'dinner','name':'Dinner','amount':5001,'paidBy':data['people'][0]['id'],'participants':[data['people'][0]['id'],'jamie']}]
    assert client.put(f'/api/rooms/{code}',json=data,headers=auth(host)).status_code == 200
    guest = client.post(f'/api/rooms/{code}/join',json={'password':'0123'}).json()
    result = client.post(f'/api/rooms/{code}/identify',json={'personId':'jamie'},headers=auth(guest))
    assert result.status_code == 200, result.text
    assert result.json()['personId'] == 'jamie'
    assert len(result.json()['room']['people']) == 2
    assert result.json()['room']['items'][0]['participants'][-1] == 'jamie'
    assert client.post(f'/api/rooms/{code}/identify',json={'personId':'missing'},headers=auth(guest)).status_code == 404
    assert client.post(f'/api/rooms/{code}/identify',json={'personId':'jamie'}).status_code == 401

def test_guest_can_create_a_new_person_and_duplicate_names_are_rejected(client):
    host = create(client)
    code = host['room']['code']
    guest = client.post(f'/api/rooms/{code}/join',json={'password':'0123'}).json()
    result = client.post(f'/api/rooms/{code}/identify',json={'name':'  Taylor  '},headers=auth(guest))
    assert result.status_code == 200, result.text
    assert result.json()['room']['people'][-1]['id'] == result.json()['personId']
    assert result.json()['room']['people'][-1]['name'] == 'Taylor'
    assert result.json()['room']['people'][-1]['avatar'] in ['cat','capybara','dog','chameleon']
    assert result.json()['room']['version'] == 2
    assert client.post(f'/api/rooms/{code}/identify',json={'name':'taylor'},headers=auth(guest)).status_code == 409
    assert client.post(f'/api/rooms/{code}/identify',json={'name':'   '},headers=auth(guest)).status_code == 422
    assert client.post(f'/api/rooms/{code}/identify',json={'name':'Taylor','personId':result.json()['personId']},headers=auth(guest)).status_code == 422

def test_custom_allocations_persist_and_invalid_splits_are_rejected(client):
    host=create(client)
    data=host['room']; code=data['code']; first=data['people'][0]['id']
    data['people'].extend([{'id':'b','name':'Jamie','avatar':'capybara'},{'id':'c','name':'Sam','avatar':'chameleon'}])
    item={'id':'dinner','name':'Dinner','amount':10001,'paidBy':first,'participants':[first,'b','c'],'allocations':{first:2000}}
    data['items']=[item]
    response=client.put(f'/api/rooms/{code}',json=data,headers=auth(host))
    assert response.status_code==200,response.text
    assert response.json()['items'][0]['allocations']=={first:2000}
    data=response.json()
    for invalid in [{first:10002},{first:2000,'b':1000,'c':1000},{first:-1},{'outsider':20},{first:1.5}]:
        data['items'][0]['allocations']=invalid
        assert client.put(f'/api/rooms/{code}',json=data,headers=auth(host)).status_code==422
    data['items'][0]['allocations']={first:0,'b':5000,'c':5001}
    assert client.put(f'/api/rooms/{code}',json=data,headers=auth(host)).status_code==200

def test_animal_avatars_are_validated_and_persisted(client):
    host=create(client);data=host['room'];code=data['code']
    assert data['people'][0]['avatar'] in ['cat','capybara','dog','chameleon']
    for animal in ['cat','capybara','dog','chameleon']:
        data['people'][0]['avatar']=animal
        response=client.put(f'/api/rooms/{code}',json=data,headers=auth(host))
        assert response.status_code==200,response.text
        data=response.json()
        assert data['people'][0]['avatar']==animal
    data['people'][0]['avatar']='dragon'
    assert client.put(f'/api/rooms/{code}',json=data,headers=auth(host)).status_code==422

def test_optional_bank_and_paypal_preferences(client):
    host=create(client);data=host['room'];code=data['code']
    bank={'method':'bank','accountName':'Alex Test','sortCode':'000000','accountNumber':'00000000'}
    data['people'][0]['payment']=bank
    response=client.put(f'/api/rooms/{code}',json=data,headers=auth(host))
    assert response.status_code==200,response.text
    data=response.json()
    assert data['people'][0]['payment']['sortCode']=='000000'
    for paypal in ['friend@example.com','https://paypal.me/TestFriend']:
        data['people'][0]['payment']={'method':'paypal','paypal':paypal}
        response=client.put(f'/api/rooms/{code}',json=data,headers=auth(host))
        assert response.status_code==200,response.text
        data=response.json()
        assert data['people'][0]['payment']['paypal']==paypal
        assert data['people'][0]['payment']['accountNumber'] is None
    for invalid in [dict(bank,sortCode='12345'),dict(bank,accountNumber='123'),{'method':'paypal','paypal':'javascript:alert(1)'},{'method':'paypal','paypal':'https://paypal.me.evil.example/person'}]:
        data['people'][0]['payment']=invalid
        assert client.put(f'/api/rooms/{code}',json=data,headers=auth(host)).status_code==422
    data['people'][0]['payment']=None
    assert client.put(f'/api/rooms/{code}',json=data,headers=auth(host)).status_code==200

def test_production_frontend_and_invite_path_share_the_api_origin(client):
    from app import STATIC_DIR
    if not STATIC_DIR.is_dir():
        pytest.skip('Build the frontend before verifying production serving')
    import re
    page=client.get('/?room=01234')
    assert page.status_code==200
    assert '<div id="root"></div>' in page.text
    script=re.search(r'src="([^"]+\.js)"',page.text).group(1)
    assert client.get(script).status_code==200
    assert client.get('/api/health').json()=={'status':'ok'}
