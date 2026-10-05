// Catálogo único del dominio. El frontend lo recibe vía GET /api/meta,
// así que cualquier cambio aquí se refleja en toda la app.

export const CURRENCIES = ['VES/USD', 'CLP', 'PEN', 'MXN'];

export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Archivos que se suben por cada flujo (capturas de Optimove o CSV). */
export const UPLOAD_SLOTS = [
  { key: 'email_stats', label: 'Estadísticas de correos', hint: 'Enviados, abiertos, clics, clientes objetivo' },
  { key: 'depositor_ids', label: 'IDs usuarios depositantes', hint: 'Listado de clientes que depositaron' },
  { key: 'avg_deposits', label: 'Avg. Number of Deposits', hint: '' },
  { key: 'avg_deposit_amount', label: 'Avg. Total Deposit Amount', hint: '' },
  { key: 'avg_activity_days', label: 'Avg. Number of Activity Days', hint: '' },
  { key: 'avg_bet_amount', label: 'Avg. Total Bet Amount', hint: '' },
  { key: 'avg_net_revenue', label: 'Avg. Total Net Revenue', hint: '' },
  { key: 'avg_sport_bets', label: 'Avg. Number of Real Sport Bets', hint: '' },
];

/**
 * Métricas guardadas por reporte. `type` define cómo se valida y `format` cómo se muestra.
 * Las claves coinciden con las columnas del modelo Report en prisma/schema.prisma.
 */
export const METRICS = [
  { key: 'targetedCustomers', label: 'Clientes objetivo', type: 'int', format: 'number', group: 'audience', description: 'Total de clientes del segmento/flujo' },
  { key: 'emailsSent', label: 'Correos enviados', type: 'int', format: 'number', group: 'audience', description: 'Correos enviados (o entregados si no hay enviados)' },
  { key: 'emailsOpened', label: 'Aperturas', type: 'int', format: 'number', group: 'audience', description: 'Correos abiertos (únicos si está disponible)' },
  { key: 'emailsClicked', label: 'Clics', type: 'int', format: 'number', group: 'audience', description: 'Clics en correos (únicos si está disponible)' },
  { key: 'depositors', label: 'Depositantes', type: 'int', format: 'number', group: 'audience', description: 'Cantidad de clientes que depositaron' },
  { key: 'avgDeposits', label: 'Prom. depósitos', type: 'float', format: 'number', group: 'kpi', description: 'Avg. Number of Deposits' },
  { key: 'avgDepositAmount', label: 'Monto prom. depósitos', type: 'float', format: 'money', group: 'kpi', description: 'Avg. Total Deposit Amount' },
  { key: 'avgActivityDays', label: 'Días de actividad', type: 'float', format: 'number', group: 'kpi', description: 'Avg. Number of Activity Days' },
  { key: 'avgBetAmount', label: 'Monto prom. apostado', type: 'float', format: 'money', group: 'kpi', description: 'Avg. Total Bet Amount' },
  { key: 'avgNetRevenue', label: 'Net revenue prom.', type: 'float', format: 'money', group: 'kpi', description: 'Avg. Total Net Revenue' },
  { key: 'avgSportBets', label: 'Apuestas deportivas', type: 'float', format: 'number', group: 'kpi', description: 'Avg. Number of Real Sport Bets' },
];

export const METRIC_KEYS = METRICS.map((m) => m.key);

export const REPORT_STATUS = ['DRAFT', 'IN_REVIEW', 'PUBLISHED'];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_MIME = /^(image\/(png|jpe?g|webp|heic|heif)|text\/(csv|plain)|application\/(vnd\.ms-excel|csv))$/;
