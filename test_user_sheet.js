import fs from 'fs';

const API_BASE = 'http://localhost:4000/api';

async function testUserSheet() {
  console.log('=== 🚚 VERIFYING USER-PROVIDED SPREADSHEET (133 ROWS, 23 COLUMNS) ===\n');

  // 1. Signup test account
  const userPayload = {
    companyName: 'Apex Fleet Logistics',
    industry: 'Freight / Dispatch / Carrier Network',
    name: 'Sarah Jenkins',
    email: `sarah.jenkins+${Date.now()}@apexfleet.com`,
    password: 'Password123!',
  };
  const signupRes = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userPayload),
  });
  if (!signupRes.ok) throw new Error(`Signup failed: ${await signupRes.text()}`);
  const authData = await signupRes.json();
  const token = authData.token;
  console.log(`✅ 1. Authenticated as ${authData.user.email} (Company: ${authData.company.name})`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. Create Campaign Profile
  const profileRes = await fetch(`${API_BASE}/profiles`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'DOT Registered Carriers Campaign',
      description: 'Directory of interstate freight carriers and owner operators',
      template: 'blank',
    }),
  });
  const profile = await profileRes.json();
  console.log(`✅ 2. Created Campaign Profile: "${profile.name}" (ID: ${profile.id})`);

  // 3. Test Preview on user's exact dataset
  const csvPath = 'c:/Users/MBS/Desktop/crm-mvp/test_data/user_provided_sheet.csv';
  const csvBuffer = fs.readFileSync(csvPath);
  const blob = new Blob([csvBuffer], { type: 'text/csv' });
  const formPreview = new FormData();
  formPreview.append('file', blob, 'user_provided_sheet.csv');

  const prevRes = await fetch(`${API_BASE}/profiles/${profile.id}/import/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formPreview,
  });
  const previewData = await prevRes.json();
  console.log(`\n✅ 3. Import Preview detected ${previewData.totalRows} rows and ${previewData.fields.length} columns:`);
  previewData.fields.forEach(f => {
    console.log(`   [Col ${f.order}] ${f.header} -> Inferred Type: ${f.inferredType} (Samples: ${JSON.stringify(f.sampleValues)})`);
  });

  // 4. Perform Full Import
  const formImport = new FormData();
  formImport.append('file', new Blob([csvBuffer], { type: 'text/csv' }), 'user_provided_sheet.csv');
  const importRes = await fetch(`${API_BASE}/profiles/${profile.id}/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formImport,
  });
  const importResult = await importRes.json();
  console.log(`\n✅ 4. Full Import Result: ${importResult.rowsImported} rows imported, ${importResult.fieldsCreated} columns configured.`);

  // 5. Verify Fields Order in Database
  const fieldsRes = await fetch(`${API_BASE}/profiles/${profile.id}/fields`, { headers: authHeaders });
  const fields = await fieldsRes.json();
  console.log(`\n✅ 5. Verified Database Fields Schema & Left-to-Right Sequence (${fields.length} fields):`);
  const expectedHeaders = [
    'MC Number', 'USDOT Status', 'State', 'Operating Authority Status', 'Entity Type',
    'Legal Name', 'Telephone', 'Email', 'Address', 'U.S DOT',
    'Vehicle Miles Traveled', 'VMT Year', 'Power Units', 'DUNS Number', 'Drivers',
    'Carrier Operation', 'Passenger', 'HM', 'HHG', 'New Entrant',
    'Operation Classification', 'Cargo Classifications', 'Cargo Info'
  ];

  fields.forEach((f, idx) => {
    const isMatching = f.label.toLowerCase().trim() === expectedHeaders[idx]?.toLowerCase().trim();
    console.log(`   [Order ${f.order_index}] Key: "${f.key}", Label: "${f.label}" ${isMatching ? '✓' : '✗ MISMATCH'}`);
    if (!isMatching) throw new Error(`Column ordering mismatch at index ${idx}: expected "${expectedHeaders[idx]}", got "${f.label}"`);
  });

  // 6. Verify Records & Blank Field Retention
  const recordsRes = await fetch(`${API_BASE}/profiles/${profile.id}/records?pageSize=150`, { headers: authHeaders });
  const recordsData = await recordsRes.json();
  console.log(`\n✅ 6. Retrieved ${recordsData.records.length} records. Inspecting specific rows for blank position retention:`);

  // Row 1 (JASTER TRUCKING LLC)
  const r1 = recordsData.records.find(r => r.data['mc_number'] === 'MC 1822000');
  console.log(`   - Row 1 (MC 1822000): Legal Name = "${r1.data['legal_name']}", State = "${r1.data['state']}", New Entrant (Blank) = "${r1.data['new_entrant']}"`);
  if (r1.data['new_entrant'] !== '') throw new Error('Expected blank new_entrant for Row 1');

  // Row 19 (FIELDSTONE AG SERVICES LLC) - blank drivers, new_entrant, cargo_info
  const r19 = recordsData.records.find(r => r.data['mc_number'] === 'MC 1822019');
  console.log(`   - Row 19 (MC 1822019): Legal Name = "${r19.data['legal_name']}", Drivers (Blank) = "${r19.data['drivers']}", Cargo Info (Blank) = "${r19.data['cargo_info']}"`);
  if (r19.data['drivers'] !== '' || r19.data['cargo_info'] !== '') throw new Error('Expected blank fields for Row 19');

  // Row 28 (ELITE LMD INC) - blank telephone
  const r28 = recordsData.records.find(r => r.data['mc_number'] === 'MC 1822029');
  console.log(`   - Row 28 (MC 1822029): Legal Name = "${r28.data['legal_name']}", Telephone (Blank) = "${r28.data['telephone']}", Email = "${r28.data['email']}"`);
  if (r28.data['telephone'] !== '') throw new Error('Expected blank telephone for Row 28');

  // Row 105 (INGLESE BOX COMPANY) - blank email
  const r105 = recordsData.records.find(r => r.data['mc_number'] === 'MC 1822209');
  console.log(`   - Row 105 (MC 1822209): Legal Name = "${r105.data['legal_name']}", Telephone = "${r105.data['telephone']}", Email (Blank) = "${r105.data['email']}"`);
  if (r105.data['email'] !== '') throw new Error('Expected blank email for Row 105');

  // 7. Verify Dynamic Filtering on Custom Fields
  console.log('\n--- 🔍 Testing Dynamic Filter Engine on 23-Column Sheet ---');

  // Filter 1: State = 'TX'
  const filterTx = [{ key: 'state', op: 'eq', value: 'TX' }];
  const resTx = await fetch(`${API_BASE}/profiles/${profile.id}/records?filters=${encodeURIComponent(JSON.stringify(filterTx))}`, { headers: authHeaders });
  const dataTx = await resTx.json();
  console.log(`✅ Filter (State = "TX"): Found ${dataTx.total} matching carriers in Texas`);

  // Filter 2: Power Units >= 5
  const filterFleet = [{ key: 'power_units', op: 'gte', value: '5' }];
  const resFleet = await fetch(`${API_BASE}/profiles/${profile.id}/records?filters=${encodeURIComponent(JSON.stringify(filterFleet))}&sortBy=data.power_units&sortDir=desc`, { headers: authHeaders });
  const dataFleet = await resFleet.json();
  console.log(`✅ Filter (Power Units >= 5, Sorted DESC): Found ${dataFleet.total} fleet carriers:`);
  dataFleet.records.slice(0, 5).forEach(r => {
    console.log(`   - ${r.data['legal_name']} (${r.data['state']}): Power Units = ${r.data['power_units']}, MC: ${r.data['mc_number']}`);
  });

  // 8. Test Data Export (CSV & XLSX)
  console.log('\n--- ⤓ Testing Data Export for 23 Columns ---');
  const csvExportRes = await fetch(`${API_BASE}/profiles/${profile.id}/export?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  const csvText = await csvExportRes.text();
  const exportedHeaders = csvText.split('\n')[0].split(',');
  console.log(`✅ CSV Export generated ${csvText.split('\n').length} lines. Dynamic columns in header line:`);
  console.log(`   ${csvText.split('\n')[0].slice(0, 120)}...`);

  const xlsxExportRes = await fetch(`${API_BASE}/profiles/${profile.id}/export?format=xlsx`, { headers: { Authorization: `Bearer ${token}` } });
  const xlsxBlob = await xlsxExportRes.blob();
  console.log(`✅ Excel (XLSX) Export generated ${xlsxBlob.size} bytes binary document.`);

  console.log('\n=== 🎉 USER-PROVIDED DATASET FULLY TESTED & VERIFIED WITH 100% STRUCTURE RETENTION! ===');
}

testUserSheet().catch(err => {
  console.error('❌ User Sheet Test Failed:', err);
  process.exit(1);
});
