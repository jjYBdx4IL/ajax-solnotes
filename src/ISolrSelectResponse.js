
const SelectResponseHeaderParams = class {
  /** @type {string} */
  "_" = undefined;
  /** @type {string} */
  "json.nl" = undefined;
  /** @type {string} */
  "json.wrf" = undefined;
  /** @type {string} */
  q = undefined;
  /** @type {string} */
  rows = undefined;
  /** @type {string} */
  supportstart = undefined;
  /** @type {string} */
  wt = undefined;
}

const SelectResponseHeader = class {
  /** @type {number} */
  QTime = undefined;
  /** @type {number} */
  status = undefined;
  /** @type {SelectResponseHeaderParams} */
  params = undefined;
}

const SelectResponseBodyDoc = class {
  /** @type {string} */
  id = undefined;
  /** actually an integer, but possibly too large @type {string} */
  _version_ = undefined;
  /** ISO8601-formatted UTC time @type {string} */
  created_dt = undefined;
  /** ISO8601-formatted UTC time @type {string} */
  lmod_dt = undefined;
  /** @type {string[]} */
  text = undefined;
}

const SelectResponseBody = class {
  /** @type {SelectResponseBodyDoc[]} */
  docs = undefined;
  /** @type {number} */
  numFound = undefined;
  /** @type {boolean} */
  numFoundExact = undefined;
  /** @type {number} */
  start = undefined;
}

const SelectResponse = class {
  /** @type {SelectResponseHeader} */
  responseHeader = undefined;
  /** @type {SelectResponseBody} */
  response = undefined;
}
