import assert from "node:assert/strict";
import test from "node:test";
import {
  COURSE_MCP_APP_HTML_MARKER,
  COURSE_MCP_APP_MIME_TYPE,
  COURSE_MCP_APP_RESOURCE_URI,
  COURSE_MCP_APP_VERSION,
  courseMcpAppToolMeta,
  listCourseMcpAppResources,
  readCourseMcpAppResource
} from "../../supabase/functions/_shared/aralearn-authoring/courseMcpAppResource.js";

test("o recurso visual usa MCP Apps com URI versionada e degradação textual", () => {
  assert.equal(COURSE_MCP_APP_VERSION, "0.0.46");
  assert.equal(COURSE_MCP_APP_RESOURCE_URI,
    "ui://aralearn/course-inspector/0.0.46.html");
  assert.equal(COURSE_MCP_APP_MIME_TYPE, "text/html;profile=mcp-app");
  assert.deepEqual(courseMcpAppToolMeta(), {
    ui: { resourceUri: COURSE_MCP_APP_RESOURCE_URI },
    "openai/outputTemplate": COURSE_MCP_APP_RESOURCE_URI
  });

  const listed = listCourseMcpAppResources();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].uri, COURSE_MCP_APP_RESOURCE_URI);
  assert.equal(listed[0].mimeType, COURSE_MCP_APP_MIME_TYPE);
  assert.equal(readCourseMcpAppResource("ui://aralearn/unknown.html"), null);

  const resource = readCourseMcpAppResource(COURSE_MCP_APP_RESOURCE_URI);
  assert.equal(resource.mimeType, COURSE_MCP_APP_MIME_TYPE);
  assert.deepEqual(resource._meta.ui.csp, {
    connectDomains: [],
    resourceDomains: ["https://fabio-ara.github.io"]
  });
  assert.equal(resource._meta.ui.prefersBorder, true);
  assert.equal(resource.text.includes(COURSE_MCP_APP_HTML_MARKER), true);
  assert.match(resource.text, /method === "ui\/notifications\/tool-result"/u);
  assert.match(resource.text, /request\("ui\/initialize", \{/u);
  assert.match(resource.text, /appInfo: \{ name: "AraLearn Course Inspector"/u);
  assert.match(resource.text, /notify\("ui\/notifications\/initialized"\)/u);
  assert.match(resource.text, /notify\("ui\/notifications\/size-changed", \{ width, height \}\)/u);
  assert.match(resource.text, /resizeObserver\?\.disconnect\(\)/u);
  assert.match(resource.text, /respond\(id\)/u);
  assert.doesNotMatch(resource.text, /ui\/notifications\/teardown-complete/u);
  assert.match(resource.text, /renderPackageStudyUnitArticle\(studyUnit, \{/u);
  assert.match(resource.text,
    /https:\/\/fabio-ara\.github\.io\/AraLearn\/src\/render\/renderPackageStudyUnit\.js\?v=0\.0\.46/u);
  assert.match(resource.text,
    /https:\/\/fabio-ara\.github\.io\/AraLearn\/src\/resources\/packages\/index\.js\?v=0\.0\.46/u);
  assert.match(resource.text,
    /https:\/\/fabio-ara\.github\.io\/AraLearn\/styles-tokens\.css\?v=0\.0\.46/u);
  assert.match(resource.text,
    /https:\/\/fabio-ara\.github\.io\/AraLearn\/styles\.css\?v=0\.0\.46/u);
  assert.doesNotMatch(resource._meta.ui.csp.resourceDomains[0], /\/AraLearn/u);
  assert.match(resource.text, /A representação textual do resultado continua disponível/u);
  assert.match(resource.text, /member\?\.currentCourseRevision/u);
  assert.match(resource.text, /member\?\.effectiveComponentPolicies/u);
  assert.match(resource.text, /differenceCount\("accidentalDeviations"/u);
  assert.match(resource.text, /member\?\.courseId === differences\.referenceCourseId \? "Referência"/u);
  assert.match(resource.text, /function renderComponentLibrary\(data\)/u);
  assert.match(resource.text, /async function renderInspectionFocus\(data, version\)/u);
  assert.match(resource.text, /revealPracticeAnswers: true/u);
  assert.match(resource.text, /Use a referência de cada Unidade para comentar no chat/u);
  assert.match(resource.text, /Parâmetros e orientação desta Unidade/u);
  assert.doesNotMatch(resource.text, /data-observation|update_anchored_annotations/u);
  assert.doesNotMatch(resource.text, /planningMatch|differenceCount\)|declaredParameterDifferences/u);
});

test("o componente visual limita destinos de link e não abre conexão própria", () => {
  const resource = readCourseMcpAppResource(COURSE_MCP_APP_RESOURCE_URI);
  assert.match(resource.text, /url\.hostname === "fabio-ara\.github\.io"/u);
  assert.match(resource.text, /url\.pathname\.startsWith\("\/AraLearn\/"\)/u);
  assert.match(resource.text, /request\("ui\/open-link", \{ url: href \}\)/u);
  assert.match(resource.text, /Object\.hasOwn\(hostCapabilities, "openLinks"\)/u);
  assert.match(resource.text, /TEXT_ONLY_PACKAGE_IDS/u);
  assert.match(resource.text, /política do cliente não permite nesta visualização/u);
  assert.doesNotMatch(resource.text, /target = "_blank"/u);
  assert.match(resource.text, /event\.source !== window\.parent/u);
  assert.doesNotMatch(resource.text, /localStorage|sessionStorage|document\.cookie/u);
  assert.doesNotMatch(resource.text, /fetch\(|WebSocket|EventSource/u);
});
