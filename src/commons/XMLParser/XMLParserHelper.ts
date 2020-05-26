import { Builder } from 'xml2js';

import { ExternalLibraryName } from 'src/commons/application/types/ExternalTypes';
import {
  Assessment,
  AssessmentCategories,
  AssessmentOverview,
  AssessmentStatuses,
  GradingStatuses,
  IMCQQuestion,
  IProgrammingQuestion,
  Library,
  MCQChoice,
  Question,
  Testcase,
  TestcaseTypes
} from 'src/commons/assessment/AssessmentTypes';

import {
  XmlParseStrCProblem,
  XmlParseStrDeployment,
  XmlParseStrOverview,
  XmlParseStrPProblem,
  XmlParseStrProblem,
  XmlParseStrProblemChoice,
  XmlParseStrTask,
  XmlParseStrTestcase
} from './XMLParserTypes';

const editingId = -1;

const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const retrieveLocalAssessment = (): Assessment | null => {
  const assessment = localStorage.getItem('MissionEditingAssessmentSA');
  if (assessment) {
    return JSON.parse(assessment);
  } else {
    return null;
  }
};

export const retrieveLocalAssessmentOverview = (): AssessmentOverview | null => {
  const assessment = localStorage.getItem('MissionEditingOverviewSA');
  if (assessment) {
    return JSON.parse(assessment);
  } else {
    return null;
  }
};

export const storeLocalAssessment = (assessment: Assessment): void => {
  localStorage.setItem('MissionEditingAssessmentSA', JSON.stringify(assessment));
};

export const storeLocalAssessmentOverview = (overview: AssessmentOverview): void => {
  localStorage.setItem('MissionEditingOverviewSA', JSON.stringify(overview));
};

export const makeEntireAssessment = (result: any): [AssessmentOverview, Assessment] => {
  const assessmentArr = makeAssessment(result);
  const overview = makeAssessmentOverview(result, assessmentArr[1], assessmentArr[2]);
  return [overview, assessmentArr[0]];
};

const makeAssessmentOverview = (
  result: any,
  maxGradeVal: number,
  maxXpVal: number
): AssessmentOverview => {
  const task: XmlParseStrTask = result.CONTENT.TASK[0];
  const rawOverview: XmlParseStrOverview = task.$;
  return {
    category: capitalizeFirstLetter(rawOverview.kind) as AssessmentCategories,
    closeAt: rawOverview.duedate,
    coverImage: rawOverview.coverimage,
    grade: 1,
    id: editingId,
    maxGrade: maxGradeVal,
    maxXp: maxXpVal,
    number: rawOverview.number || '',
    openAt: rawOverview.startdate,
    title: rawOverview.title,
    reading: task.READING ? task.READING[0] : '',
    shortSummary: task.WEBSUMMARY ? task.WEBSUMMARY[0] : '',
    status: AssessmentStatuses.attempting,
    story: rawOverview.story,
    xp: 0,
    gradingStatus: 'none' as GradingStatuses
  };
};

const makeAssessment = (result: any): [Assessment, number, number] => {
  const task: XmlParseStrTask = result.CONTENT.TASK[0];
  const rawOverview: XmlParseStrOverview = task.$;
  const questionArr = makeQuestions(task);
  return [
    {
      category: capitalizeFirstLetter(rawOverview.kind) as AssessmentCategories,
      id: editingId,
      globalDeployment: makeLibrary(task.DEPLOYMENT),
      graderDeployment: makeLibrary(task.GRADERDEPLOYMENT),
      longSummary: task.TEXT[0],
      missionPDF: 'google.com',
      questions: questionArr[0],
      title: rawOverview.title
    },
    questionArr[1],
    questionArr[2]
  ];
};

const altEval = (str: string): any => {
  return Function('"use strict";return (' + str + ')')();
};

const makeLibrary = (deploymentArr: XmlParseStrDeployment[] | undefined): Library => {
  if (deploymentArr === undefined) {
    return {
      chapter: -1,
      external: {
        name: 'NONE' as ExternalLibraryName,
        symbols: []
      },
      globals: []
    };
  } else {
    const deployment = deploymentArr[0];
    const external = deployment.IMPORT || deployment.EXTERNAL;
    const nameVal = external ? external[0].$.name : 'NONE';
    const symbolsVal = external ? external[0].SYMBOL || [] : [];
    const globalsVal = deployment.GLOBAL
      ? (deployment.GLOBAL.map(x => [x.IDENTIFIER[0], altEval(x.VALUE[0]), x.VALUE[0]]) as Array<
          [string, any, string]
        >)
      : [];
    return {
      chapter: parseInt(deployment.$.interpreter, 10),
      external: {
        name: nameVal as ExternalLibraryName,
        symbols: symbolsVal
      },
      globals: globalsVal
    };
  }
};

const makeQuestions = (task: XmlParseStrTask): [Question[], number, number] => {
  let maxGrade = 0;
  let maxXp = 0;
  const questions: Array<IProgrammingQuestion | IMCQQuestion> = [];
  task.PROBLEMS[0].PROBLEM.forEach((problem: XmlParseStrProblem, curId: number) => {
    const localMaxXp = problem.$.maxxp ? parseInt(problem.$.maxxp, 10) : 0;
    const question: Question = {
      answer: null,
      roomId: null,
      content: problem.TEXT[0],
      id: curId,
      library: makeLibrary(problem.DEPLOYMENT),
      graderLibrary: makeLibrary(problem.GRADERDEPLOYMENT),
      type: problem.$.type,
      xp: 0,
      grade: 0,
      maxGrade: parseInt(problem.$.maxgrade, 10),
      maxXp: localMaxXp
    };
    maxGrade += parseInt(problem.$.maxgrade, 10);
    maxXp += localMaxXp;
    if (question.type === 'programming') {
      questions.push(makeProgramming(problem as XmlParseStrPProblem, question));
    }
    if (question.type === 'mcq') {
      questions.push(makeMCQ(problem as XmlParseStrCProblem, question));
    }
  });
  return [questions, maxGrade, maxXp];
};

const makeMCQ = (problem: XmlParseStrCProblem, question: Question): IMCQQuestion => {
  const choicesVal: MCQChoice[] = [];
  const solution = problem.SNIPPET ? problem.SNIPPET[0].SOLUTION : undefined;
  let solutionVal = 0;
  problem.CHOICE.forEach((choice: XmlParseStrProblemChoice, i: number) => {
    choicesVal.push({
      content: choice.TEXT[0],
      hint: null
    });
    solutionVal = choice.$.correct === 'true' ? i : solutionVal;
  });
  return {
    ...question,
    type: 'mcq',
    answer: solution ? parseInt(solution[0], 10) : 0,
    choices: choicesVal,
    solution: solutionVal
  };
};

const makeProgramming = (
  problem: XmlParseStrPProblem,
  question: Question
): IProgrammingQuestion => {
  const testcases = problem.SNIPPET[0].TESTCASES;
  const publicTestcases = testcases ? testcases[0].PUBLIC || [] : [];
  const privateTestcases = testcases ? testcases[0].PRIVATE || [] : [];
  const prepend = problem.SNIPPET[0].PREPEND;
  const postpend = problem.SNIPPET[0].POSTPEND;
  const solution = problem.SNIPPET[0].SOLUTION;

  const result: IProgrammingQuestion = {
    ...question,
    autogradingResults: [],
    prepend: prepend ? (prepend[0] as string).trim() : '',
    solutionTemplate: problem.SNIPPET[0].TEMPLATE[0].trim() as string,
    postpend: postpend ? (postpend[0] as string).trim() : '',
    testcases: publicTestcases.map(testcase => makeTestcase(testcase)),
    testcasesPrivate: privateTestcases.map(testcase => makeTestcase(testcase)),
    answer: solution ? (solution[0] as string).trim() : '',
    type: 'programming'
  };
  if (problem.SNIPPET[0].GRADER) {
    result.graderTemplate = problem.SNIPPET[0].GRADER[0];
  }
  return result;
};

const makeTestcase = (testcase: XmlParseStrTestcase): Testcase => {
  return {
    type: TestcaseTypes.public,
    answer: testcase.$.answer,
    score: parseInt(testcase.$.score, 10),
    program: testcase._
  };
};

export const exportXml = () => {
  const assessmentStr = localStorage.getItem('MissionEditingAssessmentSA');
  const overviewStr = localStorage.getItem('MissionEditingOverviewSA');
  if (assessmentStr && overviewStr) {
    const assessment: Assessment = JSON.parse(assessmentStr);
    const overview: AssessmentOverview = JSON.parse(overviewStr);
    const filename = overview.fileName || overview.title;
    const builder = new Builder();
    const xmlTask: XmlParseStrTask = assessmentToXml(assessment, overview);
    const xml = {
      CONTENT: {
        $: {
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
        },
        TASK: xmlTask
      }
    };
    let xmlStr = builder.buildObject(xml);
    xmlStr = xmlStr.replace(/(&#xD;)+/g, '');
    download(filename + '.xml', xmlStr);
  }
};

const download = (filename: string, text: string) => {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
};

const exportLibrary = (library: Library) => {
  const deployment = {
    $: {
      interpreter: library.chapter.toString()
    },
    EXTERNAL: {
      $: {
        name: library.external.name
      }
    }
  };

  if (library.external.symbols.length !== 0) {
    /* tslint:disable:no-string-literal */
    deployment.EXTERNAL['SYMBOL'] = library.external.symbols;
  }
  if (library.globals.length !== 0) {
    /* tslint:disable:no-string-literal */
    deployment['GLOBAL'] = library.globals.map(x => {
      return {
        IDENTIFIER: x[0],
        VALUE: x[2]
      };
    });
  }
  return deployment;
};

export const assessmentToXml = (
  assessment: Assessment,
  overview: AssessmentOverview
): XmlParseStrTask => {
  const task: any = {};
  const rawOverview: XmlParseStrOverview = {
    coverimage: overview.coverImage,
    duedate: overview.closeAt,
    kind: overview.category.toLowerCase(),
    number: overview.number || '',
    startdate: overview.openAt,
    story: overview.story,
    title: overview.title
  };
  task.$ = rawOverview;

  if (overview.reading && overview.reading !== '') {
    task.READING = overview.reading;
  }

  task.WEBSUMMARY = overview.shortSummary;
  task.TEXT = assessment.longSummary;
  task.PROBLEMS = { PROBLEM: [] };

  task.DEPLOYMENT = exportLibrary(assessment.globalDeployment!);

  if (assessment.graderDeployment!.chapter !== -1) {
    task.GRADERDEPLOYMENT = exportLibrary(assessment.graderDeployment!);
  }

  assessment.questions.forEach((question: IProgrammingQuestion | IMCQQuestion) => {
    const problem = {
      $: {
        type: question.type,
        maxgrade: question.maxGrade
      },
      SNIPPET: {
        SOLUTION: question.answer
      },
      TEXT: question.content,
      CHOICE: [] as any[]
    };

    if (question.library.chapter !== -1) {
      /* tslint:disable:no-string-literal */
      problem.$['DEPLOYMENT'] = exportLibrary(question.library);
    }

    if (question.graderLibrary!.chapter !== -1) {
      /* tslint:disable:no-string-literal */
      problem.$['GRADERDEPLOYMENT'] = exportLibrary(question.graderLibrary!);
    }

    if (question.maxXp) {
      /* tslint:disable:no-string-literal */
      problem.$['maxxp'] = question.maxXp;
    }

    if (question.type === 'programming') {
      if (question.graderTemplate) {
        /* tslint:disable:no-string-literal */
        problem.SNIPPET['GRADER'] = question.graderTemplate;
      }
      const snippet = {
        ...problem.SNIPPET,
        TEMPLATE: question.solutionTemplate,
        PREPEND: question.prepend,
        POSTPEND: question.postpend,
        TESTCASES: '' as any
      };

      if (question.testcases.length || question.testcasesPrivate!.length) {
        /* tslint:disable:no-string-literal */
        snippet.TESTCASES = {};
        if (question.testcases.length) {
          const publicTests = question.testcases.map(testcase => {
            return {
              $: {
                answer: testcase.answer,
                score: testcase.score
              },
              _: testcase.program
            };
          });
          snippet.TESTCASES['PUBLIC'] = publicTests;
        }

        if (question.testcasesPrivate && question.testcasesPrivate.length) {
          const privateTests = question.testcasesPrivate.map(testcase => {
            return {
              $: {
                answer: testcase.answer,
                score: testcase.score
              },
              _: testcase.program
            };
          });
          snippet.TESTCASES['PRIVATE'] = privateTests;
        }
      }

      problem.SNIPPET = snippet;
    }

    if (question.type === 'mcq') {
      question.choices.forEach((choice: MCQChoice, i: number) => {
        problem.CHOICE.push({
          $: {
            correct: question.solution === i ? 'true' : 'false'
          },
          TEXT: choice.content
        });
      });
    }

    task.PROBLEMS.PROBLEM.push(problem);
  });

  return task;
};