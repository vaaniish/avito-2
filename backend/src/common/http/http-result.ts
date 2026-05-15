export type HttpResult<T = unknown> = {
  statusCode: number;
  body: T;
};
