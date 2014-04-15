var express = require('express');
var nunjucks = require('nunjucks');
var path = require('path');
var url = require('url');
var config = require('./lib/config');
var fs = require('fs');
var Promise = require('bluebird');
var Uploader = require('./lib/uploader');
var Emailer = require('./lib/emailer');
var Badge = require('./lib/badge');
var debug = require('./lib/debug');
var Form = require('./lib/forms').Form;
var sass = require('node-sass');

function DataURI (path) {
  return new Promise(function (resolve, reject) {
    fs.readFile(path, function (err, data) {
      if (err) return reject(err);
      else return resolve("data:image/png;base64," + data.toString('base64'));
    });
  });
}

const PORT = config('PORT', 3001);
const PRIVATE_KEY = config('PRIVATE_KEY', undefined) ? 
  config('PRIVATE_KEY') : fs.readFileSync(config('PRIVATE_KEY_FILE', './rsa-private.pem'));
const ISSUER_NAME = config('ISSUER_NAME');
const ISSUER_URL = config('ISSUER_URL');
const MANDRILL_KEY = config('MANDRILL_KEY');
const AWS_CREDENTIALS = {
  key: config('AWS_KEY'),
  secret: config('AWS_SECRET'),
  bucket: config('AWS_BUCKET')
};
const STATIC_ASSET_URL = config('STATIC_ASSET_URL', undefined);
const DEBUG = config('DEBUG', false);

var staticDir = path.join(__dirname, '/static');
var staticRoot = '/static';
var expiration = DEBUG ? 0 : 86400000 * 365;

nunjucks.configure({autoescape: true});
var bodyTpl = nunjucks.compile(fs.readFileSync(path.join(__dirname, './templates/mail.html')).toString());
var uploader = new Uploader(AWS_CREDENTIALS);
var emailer = new Emailer({
  key: MANDRILL_KEY,
  template: bodyTpl,
  subject: config('EMAIL_SUBJECT'),
  serviceUrl: ISSUER_URL,
  staticUrl: STATIC_ASSET_URL || url.resolve(ISSUER_URL, path.join('.', staticRoot, '/'))
});

var app = express();

var env = new nunjucks.Environment(new nunjucks.FileSystemLoader('templates'), {autoescape: true});
env.express(app);

app.use(function (req, res, next) {
  res.locals.static = function static (staticPath) {
    if (STATIC_ASSET_URL)
      return url.resolve(STATIC_ASSET_URL, path.join('.', staticPath));
    else
      return path.join(staticRoot, staticPath);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.compress());
app.use(sass.middleware({
  src: path.join(__dirname, "./styles"),
  dest: path.join(staticDir, "css"),
  prefix: "/static/css",
  debug: DEBUG
}));
app.use(staticRoot, express.static(staticDir, {maxAge: expiration}));

function isAction (action) {
  return function (req, res, next) {
    if (req.body.action && req.body.action === action) next();
    else next('route');
  };
}

function prepForm (opts) {
  opts = opts || {};

  return function (req, res, next) {
    var form = req.form = new Form([
      {
        name: 'badgeImage',
        label: 'Image',
        type: 'file',
        attrs: {
          accept: 'image/png'
        },
        hint: "This cub only likes <strong>pngs</strong> for now.",
        required: true,
        requireType: '.png'
      },
      {
        name: 'title',
        label: 'Title',
        type: 'text',
        attrs: {
          placeholder: 'Make it fun, add a pun.'
        },
        required: true
      },
      {
        name: 'desc',
        label: 'Description',
        type: 'text',
        attrs: {
          placeholder: 'Keep it short and sweet. Fit it in a tweet.'
        },
        required: true
      },
      {
        name: 'recipient',
        label: 'Recipient\'s email',
        type: 'text',
        attrs: {
          placeholder: 'Double check it, don\'t regret it.'
        },
        required: true
      },
      {
        name: 'name',
        label: 'Your name',
        type: 'text',
        attrs: {
          placeholder: 'Pretty self-explanatory.'
        },
        required: true
      },
      {
        name: 'sender',
        label: 'Your email',
        type: 'text',
        attrs: {
          placeholder: 'So they can badge you back!'
        },
        required: true
      },
      {
        name: 'msg',
        label: 'Message',
        type: 'textarea',
        attrs: {
          placeholder: 'Tell your badger why they deserve this masterpiece of a badge.'
        }
      }
    ]);

    if (opts.validate && !form.validate(req)) {
      return res.render('make.html', {
        formFields: form.templateData()
      });
    }

    next();
  };
}

app.get('/', function (req, res, next) {
  res.render('index.html');
});

app.get('/make', [prepForm()], function (req, res, next) {
  return res.render('make.html', {
    formFields: req.form.templateData()
  });
});

app.post('/make', [isAction('preview'), prepForm({validate: true})], function (req, res, next) {
  var form = req.form;
  var data = form.formData();
  var badge = new Badge({
    name: data.title,
    description: data.desc,
    imagePath: data.badgeImage,
    issuerUrl: ISSUER_URL
  });
  var dataUri = new DataURI(data.badgeImage);
  dataUri.then(function (dataUri) {
    return res.render('preview.html', {
      imgSrc: dataUri,
      badge: badge,
      sender: data.name,
      message: data.msg,
      serviceUrl: ISSUER_URL,
      passthrough: form.templateData()
    });
  }).catch(function (e) {
    next(e);
  });
});

app.post('/make', [isAction('issue'), prepForm({validate: true})], function (req, res, next) {
  var form = req.form;
  var data = form.formData();
  var badge = new Badge({
    name: data.title,
    description: data.desc,
    imagePath: data.badgeImage,
    issuerUrl: ISSUER_URL
  });

  debug('Start upload');
  uploader.put(badge).then(function (results) {
    debug('Make & bake badge');
    return badge.makeAssertion({
      email: data.recipient,
      hashed: true,
      salt: config('ASSERTION_SALT', undefined)
    }).sign(PRIVATE_KEY).bake();
  }).then(function (baked) {
    debug('Send email');
    return emailer.send({
      to: data.recipient, 
      from: {
        name: data.name,
        email: data.sender
      },
      message: data.msg, 
      baked: baked
    });
  }).then(function () {
    return new DataURI(data.badgeImage);
  }).then(function (dataUri) {
    debug('Done!');
    return res.render('sent.html', {
      dataUrl: dataUri,
      recipient: data.recipient
    });
  }).catch(function (e) {
    return e.field && e.message;
  }, function (e) {
    form.error(e.field, e.message);
    return res.render('make.html', {
      formFields: form.templateData()
    });
  }).catch(function (e) {
    next(e);
  });
});

app.get('/:page.html', function (req, res, next) {
  var template = path.join('page', req.params.page + '.html');
  return res.render(template, function (err, html) {
    if (err) return res.send(404);
    return res.send(html);
  });
});

app.get('/issuer.json', function (req, res, next) {
  return res.json({
    name: ISSUER_NAME,
    url: ISSUER_URL
  });
});

app.use(function(err, req, res, next) {
  debug('Error', err);
  var issueUrl = require('url').format({
    protocol: "https",
    host: "github.com",
    pathname: "/stenington/badgecub/issues/new",
    query: {
      title: "Error encountered on " + (new Date()).toISOString(),
      body: "```\n" + err + "\n```\n"
        + "\n\nPlease feel free to provide more context about what you were doing when the error occurred.\n\nThanks!"
    }
  });
  console.error(err);
  return res.render('error.html', {
    error: err,
    issueUrl: issueUrl
  });
});

app.listen(PORT, function () {
  console.log('Listening on', PORT);
});