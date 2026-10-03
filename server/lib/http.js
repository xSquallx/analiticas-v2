/** Error con código HTTP que el manejador global convierte en respuesta JSON. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, `${what} no encontrado`);

/** Valida `data` con un esquema zod o lanza 400 con el detalle. */
export function parseOr400(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'Datos inválidos', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}
