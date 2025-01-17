'use strict';
import {
  createLegalEntity,
  CreateLegalEntityParams0 as CreateLegalEntityParams,
  CreateLegalEntityResult0 as CreateLegalEntityResult
} from 'storecove-client';
import { config } from 'dotenv';
import * as express from 'express';
import * as path  from 'path';
import * as OAuthClient from 'intuit-oauth';
import * as bodyParser from 'body-parser';

// ...
config();
const app = express();

/**
 * Configure View and Handlebars
 */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/public')));
app.engine('html', require('ejs').renderFile);

app.set('view engine', 'html');
app.use(bodyParser.json());

const urlencodedParser = bodyParser.urlencoded({ extended: false });

/**
 * App Variables
 */
let oauth2_token_json = null;
let redirectUri = '';

/**
 * Instantiate new Client
 */

let oauthClient = null;

/**
 * Home Route
 */
app.get('/', function (req, res) {
  res.render('index');
});

/**
 * Get the AuthorizeUri
 */
app.get('/authUri', urlencodedParser, function (req, res) {
  oauthClient = new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID,
    clientSecret: process.env.QBO_CLIENT_SECRET,
    environment: 'sandbox',
    redirectUri: process.env.QBO_REDIRECT_URI,
  });

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'intuit-test',
  });
  res.send(authUri);
});

/**
 * Handle the callback to extract the `Auth Code` and exchange them for `Bearer-Tokens`
 */
app.get('/callback', function (req, res) {
  oauthClient
    .createToken(req.url)
    .then(function (authResponse) {
      oauth2_token_json = JSON.stringify(authResponse.getJson(), null, 2);
    })
    .catch(function (e) {
      console.error(e);
    });

  res.send('');
});

/**
 * Display the token : CAUTION : JUST for sample purposes
 */
app.get('/retrieveToken', function (req, res) {
  res.send(oauth2_token_json);
});

/**
 * Refresh the access-token
 */
app.get('/refreshAccessToken', function (req, res) {
  oauthClient
    .refresh()
    .then(function (authResponse) {
      console.log(`The Refresh Token is  ${JSON.stringify(authResponse.getJson())}`);
      oauth2_token_json = JSON.stringify(authResponse.getJson(), null, 2);
      res.send(oauth2_token_json);
    })
    .catch(function (e) {
      console.error(e);
    });
});

/**
 * getCompanyInfo ()
 */
app.get('/getCompanyInfo', async function (req, res) {
  const companyID = oauthClient.getToken().realmId;

  const url =
    oauthClient.environment == 'sandbox'
      ? OAuthClient.environment.sandbox
      : OAuthClient.environment.production;
  try {
    const qboResponse = await oauthClient
      .makeApiCall({ url: `${url}v3/company/${companyID}/companyinfo/${companyID}` });

    // console.log(`The response for API call is :${JSON.stringify(qboResponse)}`);
    const currentUserCompanyInfo = JSON.parse(qboResponse.text());
    console.log('qbo response', JSON.stringify(currentUserCompanyInfo, null, 2));
    // create the company of the currently OAUthed-in QBO user at Storecove:
    const legalEntityCreate: CreateLegalEntityParams = {
      body: {
        tenant_id: companyID,
        party_name: currentUserCompanyInfo.CompanyInfo.LegalName,
        line1: currentUserCompanyInfo.CompanyInfo.LegalAddr.Line1,
        city: currentUserCompanyInfo.CompanyInfo.LegalAddr.City,
        zip: currentUserCompanyInfo.CompanyInfo.LegalAddr.PostalCode,
        country: currentUserCompanyInfo.CompanyInfo.LegalAddr.Country
      }
    };
    const scRes = await createLegalEntity(legalEntityCreate);
    const json: CreateLegalEntityResult = await scRes.data as any;
    console.log('storecove response', json);
    res.send('ok');
  } catch (e) {
    console.error(e);
  }
});

/**
 * disconnect ()
 */
app.get('/disconnect', function (req, res) {
  console.log('The disconnect called ');
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.OpenId, OAuthClient.scopes.Email],
    state: 'intuit-test',
  });
  res.redirect(authUri);
});

/**
 * Start server on HTTP (will use ngrok for HTTPS forwarding)
 */
const server = app.listen(process.env.PORT || 8000, () => {
  console.log(`💻 Server listening on port ${(server.address() as any).port}`);
  redirectUri = `${(server.address() as any).port}` + '/callback';
  console.log(
    `💳  Step 1 : Paste this URL in your browser : ` +
      'http://localhost:' +
      `${(server.address() as any).port}`,
  );
  console.log(
    '💳  Step 2 : Copy and Paste the clientId and clientSecret from : https://developer.intuit.com',
  );
  console.log(
    `💳  Step 3 : Copy Paste this callback URL into redirectURI :` +
      'http://localhost:' +
      `${(server.address() as any).port}` +
      '/callback',
  );
  console.log(
    `💻  Step 4 : Make Sure this redirect URI is also listed under the Redirect URIs on your app in : https://developer.intuit.com`,
  );
});
