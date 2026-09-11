const items = [
  { before: 'Emails et CV éparpillés dans boîtes de réception', after: 'Tout centralisé dans un seul espace structuré' },
  { before: 'Suivi des candidatures dans des Excel', after: 'Tableau de bord clair avec stats en temps réel' },
  { before: 'Heures perdues à trier les profils', after: 'Matching intelligent qui hiérarchise les candidats' },
  { before: 'Communication d\'équipe dispersée', after: 'Messages et entretiens intégrés à la plateforme' },
];

export default function AvantApres() {
  return (
    <section className="section" id="comparison">
      <div className="container">
        <div className="section-heading center">
          <div className="eyebrow">Le changement concret</div>
          <h2>Avant et après JOBSINC</h2>
          <p>Un regard sincère sur la transformation de votre processus de recrutement.</p>
        </div>
        <div className="comparison-grid">
          {items.map((item, i) => (
            <div className="comparison-row" key={i}>
              <div className="comparison-card comparison-before">
                <span className="comparison-badge comparison-badge-before">Avant</span>
                <p>{item.before}</p>
              </div>
              <div className="comparison-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="comparison-card comparison-after">
                <span className="comparison-badge comparison-badge-after">Après</span>
                <p>{item.after}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
