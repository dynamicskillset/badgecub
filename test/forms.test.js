require('should');
var forms = require('../lib/forms');
var Field = forms.Field;
var Form = forms.Form;
var path = require('path');
var cheerio = require('cheerio');
var nunjucks = require('nunjucks');
nunjucks.configure(path.join(__dirname, '../templates'));

describe ("Forms library", function () {

  describe('Field', function () {
    describe('input[type="text"]', function () {
      it('should render to HTML', function () {
        var field = Field.build({
          name: "words",
          label: "Your words here",
          type: "text",
          attrs: {
            placeholder: "This is where you can type words"
          },
          required: true
        });
        var html = nunjucks.render("form-element.html", {
          el: field.templateData()
        });

        var $ = cheerio.load(html);
        $('label').length.should.equal(1);
        $('input').length.should.equal(1);

        $('label').attr('for').should.equal($('input').attr('id'));
        $('label').text().should.equal("Your words here:");
        $('input').attr('type').should.equal("text");
        $('input').attr('placeholder').should.equal("This is where you can type words");
        $('input').attr('name').should.equal('words');
      });

      it('should render to HTML with value', function () {
        var field = Field.build({
          name: "words",
          label: "Your words here",
          type: "text",
          attrs: {
            placeholder: "This is where you can type words"
          },
          required: true
        });
        field.validate({
          body: {
            words: "A couple words"
          }
        });
        var html = nunjucks.render("form-element.html", {
          el: field.templateData()
        });

        var $ = cheerio.load(html);
        $('input').val().should.equal("A couple words");
      });
      
      it('should render to HTML with error', function () {
        var field = Field.build({
          name: "words",
          label: "Your words here",
          type: "text",
          attrs: {
            placeholder: "This is where you can type words"
          },
          required: true
        });
        field.validate({
          body: {}
        });
        var html = nunjucks.render("form-element.html", {
          el: field.templateData()
        });

        var $ = cheerio.load(html);
        $('input').parent().hasClass('error').should.be.true;
        $('input').next().length.should.equal(1);
        $('input').next().is('small').should.be.true;
        $('input').next().hasClass('error').should.be.true;
        $('input').next().text().should.equal("This field is required");
      });
    });

    describe('input[type="file"]', function () {
      it('should render to HTML', function () {
        var field = Field.build({
          name: "aFile",
          label: "File",
          type: "file",
          attrs: {
            accept: "image/png"
          },
          required: true
        });
        var html = nunjucks.render("form-element.html", {
          el: field.templateData()
        });

        var $ = cheerio.load(html);
        $('label').length.should.equal(1);
        $('input[type="file"]').length.should.equal(1);

        $('label').attr('for').should.equal($('input').attr('id'));
        $('input').attr('type').should.equal("file");
        $('input').attr('accept').should.equal("image/png");
        $('input').attr('name').should.equal('aFile');
      });

      it('should put value in hidden field', function () {
        var field = Field.build({
          name: "aFile",
          label: "File",
          type: "file"
        });
        field.validate({
          body: {},
          files: {
            aFile: {
              size: 10,
              path: '/some/path/somewhere'
            }
          }
        });
        var html = nunjucks.render("form-element.html", {
          el: field.templateData()
        });

        var $ = cheerio.load(html);
        $('input').length.should.equal(2);
        $('input[type="file"]').length.should.equal(1);
        $('input[type="hidden"]').length.should.equal(1);
        $('input[type="hidden"]').attr('name').should.equal($('input[type="file"]').attr('name') + 'Hidden');
        $('input[type="hidden"]').val().should.equal('/some/path/somewhere');
      });

      it('should validate from hidden field if available', function () {
        var field = Field.build({
          name: "aFile",
          label: "File",
          type: "file",
          required: true
        });
        field.validate({
          body: {
            aFileHidden: '/some/path/somewhere'
          }
        }).should.be.true;
      });

      it('should error on wrong type', function () {
        var field = Field.build({
          name: "aFile",
          label: "file",
          type: "file",
          requireType: ".png"
        });
        field.validate({
          files: {
            aFile: {path: '/some/path/to/file.json'}
          }
        }).should.be.false;
        field.validate({
          body: {
            aFileHidden: '/some/path/to/file.json'
          }
        }).should.be.false;
      });
    });

    describe('textarea', function () {
      it('should render to HTML', function () {
        var field = Field.build({
          name: "someText",
          label: "Text goes here",
          type: "textarea",
          attrs: {
            placeholder: "Type it up"
          },
          required: true
        });
        var html = nunjucks.render("form-element.html", {
          el: field.templateData()
        });

        var $ = cheerio.load(html);
        $('label').length.should.equal(1);
        $('textarea').length.should.equal(1);

        $('label').attr('for').should.equal($('textarea').attr('id'));
        $('textarea').attr('placeholder').should.equal("Type it up");
        $('textarea').attr('name').should.equal('someText');
      });

      it('should render to HTML with value', function () {
        var field = Field.build({
          name: "someText",
          label: "Text goes here",
          type: "textarea",
          attrs: {
            placeholder: "Type it up"
          },
          required: true
        });
        field.validate({
          body: {
            someText: "Call me Ishmael. Some years ago..."
          }
        });
        var html = nunjucks.render("form-element.html", {
          el: field.templateData()
        });

        var $ = cheerio.load(html);
        $('textarea').text().should.equal("Call me Ishmael. Some years ago...");
      });
    });
  });

  describe("Form", function () {
    it('should provide list of template data', function () {
      var form = new Form([
        {
          name: "textA",
          label: "A",
          type: "text"
        },
        {
          name: "textB",
          label: "B",
          type: "text"
        }
      ]);
      form.templateData().length.should.equal(2);
    });

    it('should pass validation if all pass', function () {
      var form = new Form([
        {
          name: "textA",
          label: "A",
          type: "text"
        },
        {
          name: "textB",
          label: "B",
          type: "text"
        }
      ]);
      form.validate({body: {}}).should.equal.true;
    });

    it('should fail validation if one or more fails', function () {
      var form = new Form([
        {
          name: "textA",
          label: "A",
          type: "text",
          required: true
        },
        {
          name: "textB",
          label: "B",
          type: "text"
        }
      ]);
      form.validate({body: {}}).should.equal.false;
    });
  });

});
