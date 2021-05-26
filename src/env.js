let prefix = '';
if (process.env['SOSSBOX_PREFIX']) {
  prefix = process.env['SOSSBOX_PREFIX'];
} else
if (process.env['PREFIX']) {
  prefix = process.env['PREFIX'];
}

function envGet(envKey, envDefault) {
  let sosskey = prefix + envKey;
  let result;
  // Prefer SOSSBOX_key over key, but fall back to allow keys like 'PORT' to override be used to support hosting environments.
  if (process.env[sosskey]) {
    result = process.env[sosskey];
  } else
  if (process.env[envKey]) {
    result = process.env[envKey];
  } else {
    result = envDefault;
  }

  // Smart-typed return values.
  if (result === '0') return 0;
  if (result === 'true') return true;
  if (result === 'false') return false;

  let resultInt = parseInt(result);
  return resultInt ? resultInt : result;
}

module.exports = { envGet };
