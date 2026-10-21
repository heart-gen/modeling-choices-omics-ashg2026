// CloudFront Function (viewer request) guarding the facilitator entry point.
//
// The in-app sign-in gate is not a security boundary: static JavaScript can be read, so
// the credentials it compares against ship in the bundle. This adds an edge check so the
// facilitator path is not casually browsable during the session.
//
// Note the app uses hash routing everywhere except /facilitator, which is a real pathname
// precisely so it can be protected here — URL fragments are never sent to CloudFront.
//
// EXPECTED_AUTH is replaced at stack deploy time with 'Basic ' + base64(user:password).
var EXPECTED_AUTH = '__EXPECTED_AUTH__';

function handler(event) {
  var request = event.request;

  if (!request.uri.startsWith('/facilitator')) {
    return request;
  }

  var header = request.headers.authorization;
  if (header && header.value === EXPECTED_AUTH) {
    // Rewrite to the SPA shell so the client router can render the instructor view.
    request.uri = '/index.html';
    return request;
  }

  return {
    statusCode: 401,
    statusDescription: 'Unauthorized',
    headers: {
      'www-authenticate': { value: 'Basic realm="Facilitator"' },
      'cache-control': { value: 'no-store' }
    }
  };
}
