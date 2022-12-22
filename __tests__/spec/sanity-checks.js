/* eslint-env jest */

const assert = require('assert')
const path = require('path')

const fs = require('fs-extra')
const request = require('supertest')
const sass = require('sass')

const { mkPrototype, mkdtempSync } = require('../util')
const tmpDir = path.join(mkdtempSync(), 'sanity-checks')
let app

process.env.KIT_PROJECT_DIR = tmpDir

const { packageDir, projectDir } = require('../../lib/path-utils')
const { exec } = require('../../lib/exec')
const createKitTimeout = parseInt(process.env.CREATE_KIT_TIMEOUT || '90000', 10)

/**
 * Basic sanity checks on the dev server
 */
describe('The Prototype Kit', () => {
  beforeAll(async () => {
    await mkPrototype(tmpDir, { allowTracking: false, overwrite: true })
    app = require(path.join(tmpDir, 'node_modules', 'govuk-prototype-kit', 'server.js'))

    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
    jest.spyOn(sass, 'compile').mockImplementation((css, options) => ({ css }))

    require('../../lib/build/tasks').generateAssetsSync()
  }, createKitTimeout)

  it('should call writeFileSync with result css from sass.compile', () => {
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      path.join(projectDir, '.tmp', 'public', 'stylesheets', 'application.css'),
      path.join(packageDir, 'lib', 'assets', 'sass', 'prototype.scss')
    )
  })

  it('should initialise git out of the box', async () => {
    const outputLines = []
    await exec('git log', { cwd: tmpDir }, (data) => outputLines.push(data.toString()))

    function getLastMeaningfulLineTrimmed (outputLines) {
      const meaningulLines = outputLines.join('').split('\n').filter(line => line !== '')
      return meaningulLines.pop().trim()
    }

    expect(getLastMeaningfulLineTrimmed(outputLines)).toBe('Created prototype kit')
  })

  describe('index page', () => {
    it('should send a well formed response', async () => {
      const response = await request(app).get('/')
      expect(response.statusCode).toBe(200)
    })

    it('should return html file', async () => {
      const response = await request(app).get('/')
      expect(response.type).toBe('text/html')
    })
  })

  describe('plugins', () => {
    it('should allow known assets to be loaded from node_modules', (done) => {
      request(app)
        .get('/plugin-assets/govuk-frontend/govuk/all.js')
        .expect(200)
        .expect('Content-Type', /application\/javascript; charset=UTF-8/)
        .end(function (err, res) {
          if (err) {
            done(err)
          } else {
            assert.strictEqual(
              '' + res.text,
              fs.readFileSync(path.join(projectDir, 'node_modules', 'govuk-frontend', 'govuk', 'all.js'), 'utf8')
            )
            done()
          }
        })
    })

    it('should allow known assets to be loaded from node_modules', (done) => {
      request(app)
        .get('/plugin-assets/govuk-frontend/govuk/assets/images/favicon.ico')
        .expect(200)
        .expect('Content-Type', /image\/x-icon/)
        .end(function (err, res) {
          if (err) {
            done(err)
          } else {
            assert.strictEqual(
              '' + res.body,
              fs.readFileSync(path.join(projectDir, 'node_modules', 'govuk-frontend', 'govuk', 'assets', 'images', 'favicon.ico'), 'utf8')
            )
            done()
          }
        })
    })

    it('should not expose everything', function (done) {
      const consoleErrorMock = jest.spyOn(global.console, 'error').mockImplementation()

      request(app)
        .get('/govuk/assets/common.js')
        .expect(404)
        .end(function (err, res) {
          consoleErrorMock.mockRestore()
          if (err) {
            done(err)
          } else {
            done()
          }
        })
    })

    describe('misconfigured prototype kit - while upgrading kit developer did not copy over changes in /app folder', () => {
      it('should still allow known assets to be loaded from node_modules', (done) => {
        request(app)
          .get('/plugin-assets/govuk-frontend/govuk/all.js')
          .expect(200)
          .expect('Content-Type', /application\/javascript; charset=UTF-8/)
          .end(function (err, res) {
            if (err) {
              done(err)
            } else {
              assert.strictEqual(
                '' + res.text,
                fs.readFileSync(path.join(projectDir, 'node_modules', 'govuk-frontend', 'govuk', 'all.js'), 'utf8')
              )
              done()
            }
          })
      })
    })
  })
})
