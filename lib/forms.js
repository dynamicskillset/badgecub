var path = require('path');

function Field (spec) {
  var self = this;

  self.name = spec.name;
  self.type = spec.type;
  self.required = !!spec.required;
  self.value = undefined;
  self.error = undefined;

  function getBase(type) {
    switch(type) {
      case 'text':
        var b = {
          tag: 'input',
          attrs: {
            type: 'text',
          }
        };
        if (self.value) b.attrs.value = self.value;
        return b;
      case 'textarea':
        var b = {
          tag: 'textarea',
          attrs: {}
        };
        if (self.value) b.text = self.value;
        return b;
    }
  };

  function getWidgetData (type, attrs) {
    attrs = attrs || {};
    var w = getBase(type);
    Object.keys(attrs).forEach(function (attr) {
      w.attrs[attr] = attrs[attr];
    });
    return w;
  }

  self.templateData = function templateData () {
    var d = {
      name: spec.name,
      label: spec.label,
      id: spec.name + "Id",
      widget: getWidgetData(spec.type, spec.attrs)
    };
    if (self.value) d.value = self.value;
    if (self.error) d.error = self.error;
    return d;
  };

  self.validate = function validate(req) {
    if (self.required && !req.body[self.name]) {
      self.error = "This field is required";
      return false;
    }
    else {
      self.value = req.body[self.name];
      return true;
    }
  };

  return self;
}
Field.build = function build (spec) {
  if (spec.type === 'file') return new FileField(spec);
  else return new Field(spec);
}


function FileField (spec) {
  var self = this;

  self.name = spec.name;
  self.type = spec.type;
  self.required = !!spec.required;
  self.requireType = spec.requireType;
  self.value = undefined;
  self.error = undefined;

  self.templateData = function templateData () {
    var f = {
      name: spec.name,
      label: spec.label,
      id: spec.name + "Id",
      widget: {
        tag: 'input',
        attrs: {
          type: 'file'
        }
      },
      hidden: {
        name: spec.name + 'Hidden',
      },
      hint: "Badgecub wants pngs"
    };
    if (spec.attrs) {
      Object.keys(spec.attrs).forEach(function (attr) {
        f.widget.attrs[attr] = spec.attrs[attr];
      });
    }
    if (self.value) {
      f.value = self.value;
      f.hidden.value = self.value;
    }
    if (self.error) f.error = self.error;
    return f;
  };

  self.validate = function validate (req) {
    if (self.required) {
      if ((req.files && !req.files[self.name]) && !req.body[self.name + 'Hidden']) {
        self.error = "This field is required";
        return false;
      }
      else if (req.files && req.files[self.name] && req.files[self.name].size === 0) {
        self.error = "This field is required";
        return false;
      }
    }
    self.value = (req.files && req.files[self.name]) ? req.files[self.name].path : req.body[self.name + 'Hidden'];
    if (self.value && self.requireType) {
      if (path.extname(self.value) !== self.requireType) {
        self.error = "The file must be a " + self.requireType;
        return false;
      }
    }
    return true;
  };

  return self;
}

function Form (opts) {
  var self = this;

  self.fields = [];

  opts.forEach(function (fieldSpec) {
    self.fields.push(Field.build(fieldSpec));
  });

  self.templateData = function templateData () {
    return self.fields.map(function (field) {
      return field.templateData();
    });
  };

  self.validate = function validate (req) {
    var pass = true;
    self.fields.map(function (field) {
      if (!field.validate(req)) pass = false;
    });
    return pass;
  };

  self.formData = function formData () {
    var map = {};
    self.fields.forEach(function (field) {
      map[field.name] = field.value;
    });
    return map;
  };

  self.error = function error (name, msg) {
    var found = false;
    for (var idx = 0; idx < self.fields.length; idx++) {
      var field = self.fields[idx];
      if (field.name === name) {
        found = true;
        field.error = msg;
        break;
      }
    }
    return found;
  };

  return self;
}

module.exports.Field = Field;
module.exports.Form = Form;
