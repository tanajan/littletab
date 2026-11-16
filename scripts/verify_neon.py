"""Non-destructive live Neon smoke test. Creates and deletes only its own room."""
from pathlib import Path
import os
import sys
import uuid
from datetime import date, datetime
from urllib.parse import urlsplit
import httpx
import psycopg
from dotenv import load_dotenv

root=Path(__file__).resolve().parents[1]
load_dotenv(root/'.env',override=False)
load_dotenv(root/'.env.local',override=False)
dsn=os.environ.get('DATABASE_URL','').replace('postgresql+psycopg://','postgresql://',1)
if not (urlsplit(dsn).hostname or '').endswith('.neon.tech'):
    raise SystemExit('Refusing live verification: DATABASE_URL must point to Neon.')
base=os.environ.get('LITTLETAB_TEST_URL','http://127.0.0.1:8011')
created=None
try:
    with psycopg.connect(dsn,connect_timeout=20,autocommit=True) as connection, httpx.Client(base_url=base,timeout=30) as client:
        assert connection.pgconn.ssl_in_use
        assert connection.execute('SELECT 1').fetchone()==(1,)
        print('Neon PostgreSQL connection: OK (TLS)')
        assert client.get('/').status_code==200
        assert client.get('/api/health').status_code==200
        print('Running app frontend + API health: 200 OK')
        try:
            name=f'Neon setup verification {uuid.uuid4().hex}'
            response=client.post('/api/rooms',json={'name':name,'creator':'Setup host','password':'0123','currency':'GBP'})
            assert response.status_code==201
            created=response.json();code=created['room']['code']
            host_headers={'Authorization':'Bearer '+created['token']}
            print('Create room: 201')
            response=client.post(f'/api/rooms/{code}/join',json={'password':'0123'})
            assert response.status_code==200
            guest=response.json();headers={'Authorization':'Bearer '+guest['token']}
            response=client.post(f'/api/rooms/{code}/identify',json={'name':'Setup guest'},headers=headers)
            assert response.status_code==200
            room=response.json()['room'];host_id=room['people'][0]['id']
            print('Join room and choose a new person: 200')
            item={'id':uuid.uuid4().hex,'name':'Verification dinner','amount':3001,'paidBy':host_id,'participants':[p['id'] for p in room['people']],'allocations':{host_id:1000},'expenseDate':date.today().isoformat()}
            room['items']=[item]
            response=client.put(f'/api/rooms/{code}',json=room,headers=headers)
            assert response.status_code==200
            response=client.get(f'/api/rooms/{code}',headers=host_headers)
            assert response.status_code==200 and response.json()['items'][0]['allocations']=={host_id:1000}
            assert response.json()['items'][0]['expenseDate']==item['expenseDate']
            assert datetime.fromisoformat(response.json()['items'][0]['createdAt'].replace('Z','+00:00')).tzinfo is not None
            print('Save and reload dated custom-split expense: 200')
            saved=connection.execute('SELECT data FROM rooms WHERE code=%s',(code,)).fetchone()[0]
            assert saved['name']==name and saved['items'][0]['id']==item['id'] and saved['items'][0]['amount']==3001 and saved['items'][0]['expenseDate']==item['expenseDate'] and saved['items'][0]['createdAt']
            print('Direct Neon persistence check: OK')
        finally:
            if created:
                code=created['room']['code']
                response=client.delete(f'/api/rooms/{code}',headers={'Authorization':'Bearer '+created['token'],'X-Owner-Token':created['ownerToken']})
                assert response.status_code==204
                assert connection.execute('SELECT count(*) FROM rooms WHERE code=%s',(code,)).fetchone()[0]==0
                print('Delete only the verification room: 204')
    print('Neon end-to-end verification: PASS')
except Exception as error:
    print(f'Neon end-to-end verification: FAIL ({type(error).__name__})',file=sys.stderr)
    raise SystemExit(1)
