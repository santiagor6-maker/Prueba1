export function Glossary() {
  return (
    <details class="card">
      <summary>¿Cómo leer estas cifras?</summary>
      <dl class="glossary" style="margin-top:10px">
        <dt>XIRR</dt>
        <dd>Tu rentabilidad real, ponderada por dinero: tiene en cuenta cuándo y cuánto aportaste o retiraste. Es la tasa anual que iguala tus flujos con el valor actual.</dd>
        <dt>TWR</dt>
        <dd>La rentabilidad de la inversión, ponderada por tiempo: elimina el efecto de tus aportes y retiros. Es la que se compara con un índice. Se calcula mes a mes (Modified Dietz) y se encadena.</dd>
        <dt>Índice</dt>
        <dd>Rentabilidad anual del índice con dividendos reinvertidos, en el mismo periodo y convertida a la moneda elegida con la TRM de cada fecha.</dd>
        <dt>KS-PME</dt>
        <dd>Compara con el índice usando exactamente tus mismas fechas de aportes y retiros. Mayor que 1: le ganaste al índice; menor que 1: habrías ganado más en el índice.</dd>
        <dt>No realizada</dt>
        <dd>Valor actual menos costo promedio de lo que aún tienes (calculada en la moneda de la cuenta y convertida a la tasa de la fecha de corte).</dd>
        <dt>Realizada</dt>
        <dd>Ganancia o pérdida de lo que ya vendiste, con costo promedio.</dd>
        <dt>Estimado</dt>
        <dd>Datos reconstruidos o no observados en el mercado: dividendos calculados, precio de lista del inmueble.</dd>
      </dl>
    </details>
  );
}
