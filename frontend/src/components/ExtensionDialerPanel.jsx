export default function ExtensionDialerPanel({ profileId, phoneFieldKey, records }) {
  return (
    <div className="dialer-panel card">
      <div className="dialer-panel-title"><strong>Google Voice Extension Dialer</strong><span className="dialer-mode">Browser based</span></div>
      {!phoneFieldKey ? <div className="dialer-message">Select and validate a phone column above.</div> : <>
        <div className="dialer-message">The dialing queue is controlled by the Ledger CRM Chrome extension. Open Google Voice, then open the extension side panel.</div>
        <dl className="extension-config"><div><dt>CRM Profile ID</dt><dd><code>{profileId}</code></dd></div><div><dt>Phone field key</dt><dd><code>{phoneFieldKey}</code></dd></div><div><dt>Visible queue</dt><dd>{records.length} records</dd></div></dl>
      </>}
    </div>
  );
}
