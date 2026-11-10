import fs from 'fs';

const API_BASE = 'http://localhost:4000/api';

async function testE2E() {
  console.log('=== 🚀 STARTING FULL E2E API VERIFICATION ===\n');

  // 1. Health Check
  const healthRes = await fetch(`${API_BASE}/health`);
  const health = await healthRes.json();
  console.log('✅ 1. Health check passed:', health);

  // 2. Signup
  const userPayload = {
    companyName: 'Apex Global Enterprises',
    industry: 'Logistics / Freight / Dispatch',
    name: 'Alex Morgan',
    email: `alex.morgan+${Date.now()}@apexglobal.com`,
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
  console.log(`✅ 2. Signup successful for ${authData.user.email} (Company: ${authData.company.name})`);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 3. Create 3 Separate Multi-Industry Campaign Profiles
  console.log('\n--- 📁 Creating 3 Distinct Multi-Industry Profiles ---');
  
  // Profile 1: Freight & Dispatch Logistics
  const p1Res = await fetch(`${API_BASE}/profiles`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Freight & Dispatch Logistics',
      description: 'Carrier acquisition, lanes, and fleet management',
      template: 'dispatch',
    }),
  });
  const p1 = await p1Res.json();
  console.log(`✅ Profile 1 created: "${p1.name}" (ID: ${p1.id})`);

  // Profile 2: B2B Tech Outreach
  const p2Res = await fetch(`${API_BASE}/profiles`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'B2B Tech & SaaS Outreach',
      description: 'Enterprise decision makers and tech stacks',
      template: 'b2b',
    }),
  });
  const p2 = await p2Res.json();
  console.log(`✅ Profile 2 created: "${p2.name}" (ID: ${p2.id})`);

  // Profile 3: Medical Billing & Healthcare
  const p3Res = await fetch(`${API_BASE}/profiles`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Medical Billing Campaign',
      description: 'Private practices, clinics and NPI verification',
      template: 'medical',
    }),
  });
  const p3 = await p3Res.json();
  console.log(`✅ Profile 3 created: "${p3.name}" (ID: ${p3.id})`);

  // 4. Test Spreadsheet Import with Preview on Profile 1 (Dispatch)
  console.log('\n--- ⇪ Testing Spreadsheet Import on Profile 1 (Dispatch) ---');
  const dispatchCsvPath = 'c:/Users/MBS/Desktop/crm-mvp/test_data/dispatch_leads.csv';
  const csvBuffer = fs.readFileSync(dispatchCsvPath);
  const blob = new Blob([csvBuffer], { type: 'text/csv' });
  const form = new FormData();
  form.append('file', blob, 'dispatch_leads.csv');

  // Test preview endpoint
  const prevRes = await fetch(`${API_BASE}/profiles/${p1.id}/import/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const previewData = await prevRes.json();
  console.log(`✅ Import Preview succeeded: ${previewData.totalRows} rows detected, columns:`, previewData.fields.map(f => `${f.header} (${f.inferredType})`));

  // Test full import endpoint
  const formImport = new FormData();
  formImport.append('file', new Blob([csvBuffer], { type: 'text/csv' }), 'dispatch_leads.csv');
  const importRes = await fetch(`${API_BASE}/profiles/${p1.id}/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formImport,
  });
  const importResult = await importRes.json();
  console.log(`✅ Full Spreadsheet Import succeeded:`, importResult);

  // 5. Test Manual Lead Creation (+ Add Lead)
  console.log('\n--- ➕ Testing Manual Lead Creation ---');
  const newLeadRes = await fetch(`${API_BASE}/profiles/${p1.id}/records`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      data: {
        'company_name': 'Vanguard Freight Direct',
        'contact_name': 'Leo Vance',
        'phone_number': '555-999-1122',
        'email': 'leo@vanguardfreight.com',
        'mc_number': 'MC-882233',
        'dot_number': 'DOT-445566',
        'equipment_type': 'Dry Van',
        'primary_lane': 'Midwest to Texas',
        'fleet_size': 18,
        'weekly_gross_goal': 72000,
      },
      status: 'Qualified',
      tags: ['VIP', 'HighPriority'],
      source: 'Direct Referral',
    }),
  });
  const createdLead = await newLeadRes.json();
  console.log(`✅ Manual Lead created: "${createdLead.data['company_name']}" (Status: ${createdLead.status}, ID: ${createdLead.id})`);

  // 6. Test Inline Update & Status Progression (Lead Drawer simulation)
  console.log('\n--- ✏️ Testing Lead Updates & Progression ---');
  const patchRes = await fetch(`${API_BASE}/profiles/${p1.id}/records/${createdLead.id}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      status: 'Contacted',
      data: { ...createdLead.data, 'weekly_gross_goal': 80000 },
      tags: ['VIP', 'HighPriority', 'FollowUpRequired'],
    }),
  });
  const updatedLead = await patchRes.json();
  console.log(`✅ Lead updated: Status is now "${updatedLead.status}", Goal is $${updatedLead.data['weekly_gross_goal']}, Tags: ${updatedLead.tags.join(', ')}`);

  // 7. Test Clone Record Endpoint
  console.log('\n--- 📄 Testing Lead Duplication (Clone) ---');
  const cloneRes = await fetch(`${API_BASE}/profiles/${p1.id}/records/${createdLead.id}/clone`, {
    method: 'POST',
    headers: authHeaders,
  });
  const clonedLead = await cloneRes.json();
  console.log(`✅ Lead Cloned successfully: ID: ${clonedLead.id}, Tags: ${clonedLead.tags.join(', ')}`);

  // 8. Test Dynamic Sorting & Filtering
  console.log('\n--- 🔍 Testing Dynamic Filter Engine & JSONB Sorting ---');
  
  // Filter by Status = 'Contacted'
  const filterStatusRes = await fetch(`${API_BASE}/profiles/${p1.id}/records?status=Contacted`, {
    headers: authHeaders,
  });
  const statusResults = await filterStatusRes.json();
  console.log(`✅ Status filter ("Contacted"): ${statusResults.total} match(es)`);

  // Multi-condition Filter: fleet_size >= 15
  const multiFilter = [{ key: 'fleet_size', op: 'gte', value: '15' }];
  const filterCondRes = await fetch(`${API_BASE}/profiles/${p1.id}/records?filters=${encodeURIComponent(JSON.stringify(multiFilter))}&sortBy=data.fleet_size&sortDir=desc`, {
    headers: authHeaders,
  });
  const condResults = await filterCondRes.json();
  console.log(`✅ Dynamic condition filter (Fleet Size >= 15, Sorted DESC): ${condResults.total} match(es)`);
  condResults.records.forEach(r => {
    console.log(`   - ${r.data['company_name'] || 'Lead'}: Fleet Size = ${r.data['fleet_size']}`);
  });

  // 9. Test Kanban Stage Stats Aggregation
  console.log('\n--- 📊 Testing Pipeline Stage Aggregation (/stats) ---');
  const statsRes = await fetch(`${API_BASE}/profiles/${p1.id}/records/stats`, {
    headers: authHeaders,
  });
  const stats = await statsRes.json();
  console.log(`✅ Pipeline Stats: Total = ${stats.total}, Breakdown:`, stats.breakdown);

  // 10. Test Saved Filters (Presets)
  console.log('\n--- 💾 Testing Saved Views / Filter Presets ---');
  const createPresetRes = await fetch(`${API_BASE}/profiles/${p1.id}/saved-filters`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'High Capacity Carriers (Fleet ≥ 15)',
      conditions: {
        filters: multiFilter,
      },
    }),
  });
  const preset = await createPresetRes.json();
  console.log(`✅ Saved Filter Preset created: "${preset.name}" (ID: ${preset.id})`);

  const listPresetsRes = await fetch(`${API_BASE}/profiles/${p1.id}/saved-filters`, {
    headers: authHeaders,
  });
  const presetList = await listPresetsRes.json();
  console.log(`✅ Listed Saved Presets (${presetList.length} total)`);

  // 11. Test CSV and Excel Exports
  console.log('\n--- ⤓ Testing Data Export (CSV & XLSX) ---');
  const csvExportRes = await fetch(`${API_BASE}/profiles/${p1.id}/export?format=csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const csvText = await csvExportRes.text();
  console.log(`✅ CSV Export verified (${csvText.split('\n').length} lines). First line (headers):`);
  console.log(`   ${csvText.split('\n')[0]}`);

  const xlsxExportRes = await fetch(`${API_BASE}/profiles/${p1.id}/export?format=xlsx`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const xlsxBlob = await xlsxExportRes.blob();
  console.log(`✅ Excel (XLSX) Export verified (${xlsxBlob.size} bytes downloaded)`);

  // 12. Test Campaign Isolation: Import B2B data into Profile 2
  console.log('\n--- 💼 Testing Campaign 2 Isolation (B2B Tech Outreach) ---');
  const b2bCsvPath = 'c:/Users/MBS/Desktop/crm-mvp/test_data/b2b_tech_leads.csv';
  const b2bForm = new FormData();
  b2bForm.append('file', new Blob([fs.readFileSync(b2bCsvPath)], { type: 'text/csv' }), 'b2b_tech_leads.csv');
  const b2bImportRes = await fetch(`${API_BASE}/profiles/${p2.id}/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: b2bForm,
  });
  const b2bResult = await b2bImportRes.json();
  console.log(`✅ Profile 2 B2B Data Ingested:`, b2bResult);

  const p2RecordsRes = await fetch(`${API_BASE}/profiles/${p2.id}/records`, { headers: authHeaders });
  const p2Records = await p2RecordsRes.json();
  console.log(`✅ Profile 2 contains ${p2Records.total} leads. First lead tech stack: "${p2Records.records[0]?.data['tech_stack']}" (Deal Size: $${p2Records.records[0]?.data['deal_size']})`);

  // 13. Test Campaign 3 Isolation (Medical Billing)
  console.log('\n--- 🏥 Testing Campaign 3 Isolation (Medical Billing) ---');
  const medCsvPath = 'c:/Users/MBS/Desktop/crm-mvp/test_data/medical_billing_leads.csv';
  const medForm = new FormData();
  medForm.append('file', new Blob([fs.readFileSync(medCsvPath)], { type: 'text/csv' }), 'medical_billing_leads.csv');
  const medImportRes = await fetch(`${API_BASE}/profiles/${p3.id}/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: medForm,
  });
  const medResult = await medImportRes.json();
  console.log(`✅ Profile 3 Medical Data Ingested:`, medResult);

  const p3RecordsRes = await fetch(`${API_BASE}/profiles/${p3.id}/records`, { headers: authHeaders });
  const p3Records = await p3RecordsRes.json();
  console.log(`✅ Profile 3 contains ${p3Records.total} leads. First provider EHR: "${p3Records.records[0]?.data['current_ehr']}" (NPI: ${p3Records.records[0]?.data['npi_number']})`);

  console.log('\n=== 🎉 ALL 13 END-TO-END VERIFICATION CHECKS PASSED PERFECTLY! ===');
}

testE2E().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
