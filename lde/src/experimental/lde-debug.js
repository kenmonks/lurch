/*
 *        Global n-compact validation in the Browser or Node
 *
 * To import n-compact validation in a web page, just load this file.
 * e.g.
 *
 *  <script type='module' src="../index.js"></script>
 *
 * and adjust the path to src accordingly.
 */

import "./disable-event-target.js"

let testarg
if (typeof window === "object") {
  console.log(`In a browser window.`)
} else if (typeof self === "object") {
  testarg = "."
  console.log(`In a web worker.`)
} else if (typeof global === "object") {
  self = global
  console.log(`In node.`)
}

import * as Lurch from "../index.js"
Object.assign(self, Lurch)

import { Problem } from "../matching/problem.js"
self.Problem = Problem

import CNF from "../validation/conjunctive-normal-form.js"
self.CNF = CNF

import { parse } from "./parsers/lurch-to-putdown.js"
self.parse = parse
self.lurchToPutdown = parse

import { parse as lurchToLatex } from "./parsers/lurch-to-tex.js"
self.lurchToLatex = lurchToLatex
self.tex = lurchToLatex

import { latexToLurch } from "./parsers/tex-to-lurch.js"
self.latexToLurch = latexToLurch

import Interpret from "./interpret.js"
Object.assign(self, Interpret)

import Compact from "./global-validation.js"
Object.assign(self, Compact)

import Utils from "./utils.js"
Object.assign(self, Utils)

import { Message } from "../../../lurchmath/validation-messages.js"
self.Message = Message

import { downloadFile } from "../../../lurchmath/upload-download.js"
self.downloadFile = downloadFile

import * as TEST from "./utils/acidtestsweb.js"
self.test = () => TEST.test(testarg)
self.testall = () => TEST.testall(testarg)

// Useful Lode and Reporting utilities
self.lc = (s) => {
  const L = LogicConcept.fromPutdown(s)
  return L.length === 1 ? L[0] : L
}

self.$ = (s) => {
  let parsed = parse(s)
  return parsed ? lc(parsed) : undefined
}

self.doc = () => {
  return Message.document(tinymce.activeEditor, "putdown").content.code
}

////////////////////////////////////////////////////////
// Custom LC formatter (for a browser console)
//
// Options (booleans)
//
// The idea here is that we pass an options object to the various formatting
// routines that is of the form { showP1, ... , showPn } where all of the
// showPi's are assigned 'true'.  Thus, by just listing what you want to show
// you can customize the output in a succinct manner.
//
// show LC attributes
const showAttributes = true
// show Declares
const showDeclares = true
// show red subscripts for declaration contexts
const showContexts = true
// show formulas
const showRules = true
// show formulas
const showConsiders = true
// show partial instantiations
const showPartials = true
// show instantiations of formulas in the library
const showInstantiations = true
// show Bodies of ForSome declarations
const showBodies = true
// number the children of the LC being shown
const showNumbers = true
// show the proper names of symbols
const showProperNames = true
// show symbols with ProperNames in a different color
const showSimpleProperNames = true
// show just the last child of the document
const showUserOnly = true
// show user theorems as formulas
const showUserRules = true
// show user theorems (not the Rule copy)
const showUserThms = true
// show instantiations of user theorems
const showUserInstantiations = true
// show validation icons
const showValidation = true

// useful sets of options
//
// show all report option
const all = {
  showDeclares,
  showAttributes,
  showBodies,
  showContexts,
  showRules,
  showUserThms,
  showPartials,
  showConsiders,
  showInstantiations,
  showNumbers,
  showProperNames,
  showUserRules,
  showUserInstantiations,
  showValidation,
}
// simple report option
const show = {
  showDeclares,
  showAttributes,
  showBodies,
  showContexts,
  showRules,
  showUserThms,
  showPartials,
  showInstantiations,
  showProperNames,
  showConsiders,
  showUserRules,
  showUserInstantiations,
  showValidation,
}
// detailed report option
const detailed = {
  showDeclares,
  showRules,
  showPartials,
  showInstantiations,
  showNumbers,
  showBodies,
  showProperNames,
  showUserRules,
  showUserThms,
  showValidation,
}
// moderate report option
const moderate = {
  showInstantiations,
  showNumbers,
  showSimpleProperNames,
  showRules,
  showUserThms,
  showValidation,
}

// clean report option
const allclean = {
  showInstantiations,
  showNumbers,
  showProperNames,
  showUserThms,
  showValidation,
}
// clean report option
const clean = {
  showInstantiations,
  showNumbers,
  showSimpleProperNames,
  showUserThms,
  showValidation,
}
// user report option
const user = {
  showNumbers,
  showUserThms,
  showSimpleProperNames,
  showValidation,
}
// user report option
const defaultOptions = {
  showNumbers,
  showRules,
  showSimpleProperNames,
  showUserThms,
  showValidation,
}

// Syntactic sugar for the formatter
const metavariable = "LDE MV"
const instantiation = "LDE CI"
const EFA = "LDE EFA"
const formula = "Formula"
const constant = "constant"
const hint = "BIH"
const scoping = "scope errors"
const valid = "valid"
const invalid = "invalid"
const context = "context"
const declare = "Declare"
const ProperName = "ProperName"
const validation = "validation result"
const greencheck = "✔︎"
const redx = "✘"

// no pens for now
const id = (x) => x
const defaultPen = id
const hintPen = id
const metavariablePen = id
const constantPen = id
const decPen = id
const commentPen = id
const contextPen = id
const instantiationPen = id
const attributePen = id
const attributeKeyPen = id
const checkPen = id
const starPen = id
const xPen = id
const headingPen = id
const docPen = id
const linenumPen = id
const itemPen = id
const stringPen = id

// custom formatter
const formatter = (options = defaultOptions) => {
  return (L, S, attr) => {
    let ans = ""

    // optionally hide user Theorems or userRules
    if (
      (L.isA("Theorem") && !options.showUserThms) ||
      (L.userRule && !options.showUserRules)
    ) {
      // do nothing
      // hint markers
    } else if (L.isA(hint) || (L instanceof LurchSymbol && L.text() === "<<")) {
      ans += hintPen(S)
      // metavariables
    } else if (L.isA(metavariable)) {
      ans += metavariablePen(S)
      // the LDE EFA constant symbols
    } else if (L instanceof LurchSymbol && L.text() === EFA) {
      ans += L.constant ? constantPen("𝜆") : defaultPen("𝜆")
      // comments just display their string (second arg) with the comment pen
    } else if (L.isAComment()) {
      ans += commentPen(L.child(1))
      // proper names for constants with body and bound symbols
    } else if (options.showProperNames && L.hasAttribute(ProperName)) {
      const propname = L.getAttribute(ProperName)
      // we put quotes around the properName if it contains whitespace
      ans += L.constant
        ? declaredPen(/\s/g.test(propname) ? `'${propname}'` : propname)
        : attributePen(/\s/g.test(propname) ? `'${propname}'` : propname)
      // proper names color but not text for constants with body but not bound
    } else if (options.showSimpleProperNames && L.hasAttribute(ProperName)) {
      ans += L.constant ? declaredPen(S) : attributePen(S)
      // constants
    } else if (L.constant) {
      ans += constantPen(S)
      // declaration prefixes
    } else if (L instanceof Declaration) {
      if (!L.isA("Declare") || options.showDeclares) {
        const label = L.isA("Declare")
          ? decPen("Declare")
          : L.isA("given")
            ? decPen("Let")
            : decPen("ForSome")
        ans +=
          (L.isA("given") ? ":" : "") +
          label +
          S.slice(0).replace(/\s*,\s*]$/, "]")
      }
      // Declaration body copies
    } else if (L.bodyOf) {
      ans += options.showBodies ? instantiationPen(S) : ""
      // instantiations
    } else if (L.hasAncestorSatisfying((x) => x.isA(instantiation))) {
      ans += options.showInstantiations ? instantiationPen(S) : ""
      // Considers
    } else if (L.hasAncestorSatisfying((x) => x.isA("Consider"))) {
      ans += options.showConsiders ? instantiationPen(S) : ""
      // everything else
    } else {
      ans += defaultPen(S)
    }
    // show contexts
    if (options.showContexts) {
      if (L.hasAttribute(context)) {
        const symblist = L.getAttribute(context)
        if (symblist.length > 0) {
          ans +=
            attributePen(".") +
            symblist.map((x) => contextPen(x)).join(attributePen(","))
        }
      }
    }
    // show attributes
    if (options.showAttributes) {
      // skip highlighted attributes - first the types
      const highlighted = [
        metavariable,
        constant,
        instantiation,
        hint,
        valid,
        invalid,
        declare,
        formula,
      ].map((s) => "_type_" + s)
      // then non-types
      highlighted.push(scoping, context, ProperName, validation)
      let keys = attr.filter((a) => !highlighted.includes(a))
      // format what's left
      if (keys.length > 0) {
        // open attribute bracket
        ans += attributeKeyPen("❲")
        keys.forEach((a, k) => {
          // separate keys with commas
          ans += k > 0 ? attributePen(",") : ""
          // format types or true values just with their key
          ans += a.startsWith("_type_")
            ? attributeKeyPen(a.replace(/^_type_/, ""))
            : L[a] === true
              ? attributeKeyPen(a)
              : attributeKeyPen(a) +
              attributePen("=" + JSON.stringify(L.getAttribute(a)))
        })
        ans += attributeKeyPen("❳")
      }
      // add a faux-attribute for .consider's
      ans += L.consider ? attributeKeyPen(`❲consider❳`) : ""
    }
    // show validation except for hidden ForSome bodies
    if (options.showValidation && ans.length > 0) {
      // TODO: adding the switchover to the new validation storage
      if (L.results("BIH"))
        ans += L.results("BIH").result === "valid" ? goldstar : redstar
      // TODO: remove old style validation
      if (Validation.result(L) && Validation.result(L).result === "valid") {
        // a valid BIH has to be propositionally valid, so a green check
        // isn't necessary when there's a gold star, but we now treat them as
        // independent since so the user sees both kinds of feedback.
        ans += greencheck
        // Propositionally invalid ones. Add a red x even if it's a BIH
      } else if (
        Validation.result(L) &&
        Validation.result(L).result !== "valid"
      ) {
        ans += Validation.result(L).reason === "preemie" ? preemiex : redx
      }
    }
    // mark redeclared symbols
    if (
      L instanceof LurchSymbol &&
      L.parent() instanceof Declaration &&
      L.parent().symbols().includes(L) &&
      L.parent().hasAttribute("scope errors") &&
      L.parent().getAttribute("scope errors").redeclared &&
      L.parent().getAttribute("scope errors").redeclared.includes(L.text())
    ) {
      ans += redx
    }
    return ans
  }
}

// check the extension of a filename and add it if it is missing
const checkExtension = (name, ext = "js") =>
  name.endsWith(`.${ext}$`) ? name : name + "." + ext

// check the folder and filename for appropriate / between them and add it if
// needed, then concatenate
const checkPath = (name, folder) =>
  folder.endsWith("/")
    ? name.startsWith("/")
      ? folder + name.slice(1)
      : folder + name
    : folder + "/" + name

// default for Lurch document source files (plain text)
const LurchFileExtension = "lurch"

// Load just the string for a file and return that. You can omit the .lurch
// extension. The second argument is the folder which default to the current folder.
self.loadStr = async (name, folder = ".", extension = LurchFileExtension) => {
  const filename = checkPath(checkExtension(name, extension), folder)
  try {
    const response = await fetch(filename)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${filename}`)
    }
    return await response.text()
  } catch (error) {
    console.error(error)
  }
}

// Load a LDE document string
//
// This command works just like loadStr with one difference. If the string that
// is loaded contains a line of the form
//
//    include fname
//
// it will load the string in fname and replace that line with the contents of
// that file recursively checking for more include statements.  No checking is
// done to prevent circular dependencies.
self.loadDocStr = async (
  name,
  folder = ".",
  extension = LurchFileExtension
) => {
  try {
    // load the specified file
    let ans = await loadStr(name, folder, extension)

    // recursively replace all of the includes
    const regx = /(?:^|\n)[ \t]*[iI]nclude[ \t]+([^ \t][^\n]*)(?:\n|$)/gm

    // check if there are any includes, if yes, recursively load them, otherwise
    // just return the current file content
    if (regx.test(ans)) {
      // Use Promise.all to wait for all recursive calls to complete
      const replacements = await Promise.all(
        ans.match(regx).map(async (line) => {
          const fname = line.match(
            /(?:^|\n)[ \t]*[iI]nclude[ \t]+([^ \t][^\n]*)(?:\n|$)/m
          )[1]
          const replacement = await loadDocStr(fname, folder, extension)
          return { line, replacement }
        })
      )

      // Apply replacements to the content
      replacements.forEach(({ line, replacement }) => {
        ans = ans.replace(line, replacement)
      })
    }

    return ans
  } catch (error) {
    console.error(error)
  }
}

// Load a LDE document
//
// Load a document string, recursively replacing included files, and wrap the
// result in environment brackets, { }. before returning.
//
// self.loadDoc = async ( name, folder='.', extension=LurchFileExtension ) => {
//   // load the specified file
//   let doc = `{\n${await loadDocStr( name, folder, extension )}\n}`
//   doc = parse(doc)
//   doc = lc(doc)
//   interpret(doc)
//   validate(doc)
//   return doc
// }
self.loadDoc = async (
  name,
  folder = "./",
  extension = LurchFileExtension,
  language = "lurch"
) => {
  let doc = ""
  if (language == "lurch") {
    // load the specified file with recursive substitutions for imported libs
    doc = `{\n${await loadDocStr(name, folder, extension)}\n}`
    // convert it to putdown
    doc = parse(doc)
  } else {
    // otherwise it's putdown, most likely from exported document code from the UI
    // do just load the file directly
    doc = await loadStr(name, folder, extension)
  }
  doc = lc(doc)
  interpret(doc)
  validate(doc)
  return doc
}

// show an LC using the above formatter
self.show = (doc) => {
  console.log(doc.toPutdown(formatter()))
}
