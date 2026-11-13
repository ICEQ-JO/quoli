import type { ReactNode } from "react";

export type ResearchSource = {
  name: string;
  url: string;
  date: string;
  method: string;
  limit: string;
};
export type JournalArticle = {
  slug: string;
  title: string;
  description: string;
  topic: string;
  minutes: number;
  art: "context" | "review" | "measure";
  sections: { id: string; title: string; body: ReactNode }[];
  sources: ResearchSource[];
};
function Cite({ n }: { n: number }) {
  return (
    <sup className="journal-citation">
      <a href={`#source-${n}`} aria-label={`Source ${n}`}>
        [{n}]
      </a>
    </sup>
  );
}

export const articles: JournalArticle[] = [
  {
    slug: "beyond-the-diff",
    title: "The diff is only part of the story.",
    description:
      "When agents write the implementation, review needs a way back to the work that produced it.",
    topic: "Context & review",
    minutes: 5,
    art: "context",
    sections: [
      {
        id: "what-the-diff-leaves-out",
        title: "What the diff leaves out",
        body: (
          <>
            <p>
              A diff is an excellent answer to one question: what changed between these two states?
              It is a less complete answer to another: what happened while someone—or something—was
              working on this task?
            </p>
            <p>
              That distinction matters when a coding agent can read a repository, try an approach,
              run a command, hit a failure, edit again and finish with a plausible result. The final
              patch contains the edits that survived. It does not, on its own, explain the path that
              led there.
            </p>
            <p>
              David Heinemeier Hansson, the creator of Ruby on Rails, describes a similar need when
              discussing his agent workflow. Comparing a diff viewer with his editor, he says:
            </p>
            <blockquote>
              <p>
                “when I’m reviewing output from an agent, I often want to see the surrounding
                context.”
              </p>
              <footer>
                David Heinemeier Hansson · Lex Fridman interview, 1:40:37
                <Cite n={1} />
              </footer>
            </blockquote>
            <p>
              His example is practical: a file changed, but another file that was left untouched
              might also need attention. This is a practitioner’s observation, not an evaluation of
              Quoli. It points to a useful question for a reviewer: what else should I inspect?
            </p>
          </>
        ),
      },
      {
        id: "verification-needs-a-path",
        title: "Verification needs a path",
        body: (
          <>
            <p>
              In Stack Overflow’s 2026 survey, 48% of the 14,304 respondents to its trust question
              chose the answer that makes trust conditional on being able to easily verify the
              output. Only 6.6% selected trust across many tasks including important work decisions.
              <Cite n={2} />
            </p>
            <p>
              These are stated attitudes. They do not tell us how accurate an agent is, or whether a
              particular review tool works. They do suggest that verification is part of the
              developer’s decision to rely on AI.
            </p>
            <p>
              For a review workflow, “easy to verify” should become a set of concrete questions. Can
              I find the request? Can I locate the edit it produced? Can I see which command ran and
              what status was recorded? Can I distinguish a successful command from evidence that
              the feature actually works?
            </p>
          </>
        ),
      },
      {
        id: "follow-one-change",
        title: "Follow one change, all the way through",
        body: (
          <>
            <p>
              Consider an illustrative task: add a refund endpoint. The agent edits the handler,
              runs a test, then changes the handler once more. A green test result exists in the
              session. Its position in the sequence matters: it preceded the final edit.
            </p>
            <ol className="article-sequence">
              <li>
                <strong>Start with the request.</strong> Establish what the task asked for, without
                treating it as a complete specification.
              </li>
              <li>
                <strong>Find the recorded edits.</strong> Inspect the files and the changes
                themselves, then follow relevant repository context.
              </li>
              <li>
                <strong>Read commands in order.</strong> Check results and failures, including what
                happened after the last recorded test.
              </li>
              <li>
                <strong>Inspect the landing point.</strong> Look at the local branch, commits and
                uncommitted work.
              </li>
            </ol>
            <p>
              This is a workflow example, not an observed customer incident. It illustrates why
              chronology and code context can matter together.
            </p>
          </>
        ),
      },
      {
        id: "where-quoli-fits",
        title: "Where Quoli fits",
        body: (
          <>
            <p>
              Quoli connects recorded agent activity with code, Git and repository infrastructure. A
              session’s Summary brings review context together; the lenses provide other ways to
              investigate the same work.
            </p>
            <p>
              The goal is to reduce the reconstruction a developer has to do between terminal
              scrollback and repository tools. That is a product hypothesis to measure, not a claim
              of proven time savings.
            </p>
            <p>
              The boundaries matter just as much. Capture depends on what the supported agent
              exposes. An unrecorded event is not proof that something never happened. An import map
              does not establish runtime behavior. A completed command does not prove feature
              correctness.
            </p>
            <p>
              A useful record gives the reviewer somewhere to begin—and a way to follow the evidence
              when the final diff leaves a question unanswered.
            </p>
          </>
        ),
      },
    ],
    sources: [
      {
        name: "DHH on agent workflows and surrounding context",
        url: "https://lexfridman.com/dhh-2-transcript/",
        date: "Interview published August 2026 · passage at 1:40:37",
        method:
          "First-person practitioner interview; quotation checked against the publisher’s transcript.",
        limit: "An anecdote about his workflow. DHH has not endorsed or evaluated Quoli.",
      },
      {
        name: "Stack Overflow Developer Survey 2026: trust in AI tools",
        url: "https://survey.stackoverflow.co/2026/ai/data/ai-trust",
        date: "2026 release · survey fielded June–August 2026",
        method:
          "Optional, single-choice question; 14,304 responses. Community-recruited, self-reported survey.",
        limit:
          "Measures attitudes, not accuracy or review performance. Wording differs from the 2025 trust question; do not treat the percentages as a like-for-like trend.",
      },
    ],
  },
  {
    slug: "the-work-after-generation",
    title: "The work doesn’t end when the agent does.",
    description:
      "AI can make implementation faster. Review, correction and coordination still need a place in the workflow.",
    topic: "Engineering workflows",
    minutes: 4,
    art: "review",
    sections: [
      {
        id: "two-things-can-be-true",
        title: "Speed and friction can coexist",
        body: (
          <>
            <p>
              A coding agent finishes a task. The patch is ready. The human work now includes
              deciding what to trust, what to test, what to ask for again and what to merge.
              Generation is a milestone in that process, rather than its finish line.
            </p>
            <p>
              Atlassian’s 2026 State of Developer Experience report captures that tension. Among
              more than 1,500 software practitioners, 87% of developers said AI helped them ship
              work faster. Yet 72% reported the same or more friction in their workflow than before
              AI.
              <Cite n={1} />
            </p>
            <p>
              Those answers can be consistent. A developer may get an implementation sooner while
              still spending time clarifying intent, correcting output or moving the change through
              review. The survey does not isolate how much of that friction AI caused.
            </p>
          </>
        ),
      },
      {
        id: "review-is-real-work",
        title: "Review is real work",
        body: (
          <>
            <p>
              In the same Atlassian report, 49% of developers said they spent at least four hours a
              week on work such as reviewing AI output and correcting prompts. This is time spent on
              a set of activities, not a measured four-hour loss in net productivity.
              <Cite n={1} />
            </p>
            <p>
              Sonar’s 2026 survey offers another view. Of 1,149 technology professionals, 59%
              described reviewing, testing and correcting AI output as taking moderate or
              substantial effort. Reviewing AI-generated code required more effort than reviewing
              colleagues’ code for 38% of respondents; 27% reported less effort.
              <Cite n={2} />
            </p>
            <p>
              Both are vendor-sponsored surveys. They describe reported experience, not a controlled
              comparison of identical patches. Their useful contribution is to make the work after
              generation visible enough to discuss.
            </p>
          </>
        ),
      },
      {
        id: "make-the-handoff-inspectable",
        title: "Make the handoff inspectable",
        body: (
          <>
            <p>
              In a team handoff, “the agent finished” is a status. A reviewer needs a starting
              point. That can include the original request, recorded changes, relevant commands,
              known failures and the branch where the work sits.
            </p>
            <p>These questions make a handoff more specific:</p>
            <ul>
              <li>What did the agent change, and where can I inspect the exact edits?</li>
              <li>Which checks were recorded, and were there later edits?</li>
              <li>
                Did failures lead to a correction, or does the record end with an unresolved
                problem?
              </li>
              <li>What surrounding code or declared service deserves a closer look?</li>
            </ul>
            <p>
              None of these questions replaces a team’s tests or review standards. They help a
              person navigate the evidence before making a judgment.
            </p>
          </>
        ),
      },
      {
        id: "measure-the-review",
        title: "Measure the review, too",
        body: (
          <>
            <p>
              A fair assessment should count the whole task: implementation, review, correction and
              the quality of the eventual result. Faster generation is valuable, and additional
              review effort can be worthwhile if the total outcome improves.
            </p>
            <p>
              To evaluate a workflow like Quoli, we would compare how accurately reviewers answer
              concrete questions and how long they spend locating the evidence. Confidence alone
              would be insufficient: a fast, confident, wrong answer is not an improvement.
            </p>
            <p>
              Quoli offers connected session and repository context for this work. We have not
              established a causal reduction in review time or defects. That requires measured
              studies with comparable tasks, a disclosed sample and reported failures as well as
              successes.
            </p>
            <p>
              The opportunity is specific: make the work after generation easier to investigate,
              then test whether that helps the people responsible for shipping it.
            </p>
          </>
        ),
      },
    ],
    sources: [
      {
        name: "Atlassian: State of Developer Experience 2026",
        url: "https://www.atlassian.com/teams/software-development/state-of-developer-experience-2026",
        date: "Released October 2026 · collection dates not specified on the public summary",
        method:
          "Vendor-sponsored survey of more than 1,500 software practitioners; figures are self-reported.",
        limit:
          "Does not establish causality, net time saved or lost, or Quoli’s effectiveness. The four-hour figure includes several AI-related activities.",
      },
      {
        name: "Sonar: State of Code Developer Survey 2026",
        url: "https://www.sonarsource.com/state-of-code-developer-survey-report.pdf#page=10",
        date: "Released January 2026 · see report for survey demographics",
        method:
          "Vendor-sponsored survey of 1,149 technology professionals; review-effort figures on page 10.",
        limit:
          "Self-reported effort, not timed review tasks. The publisher sells code review and verification products.",
      },
    ],
  },
  {
    slug: "activity-is-not-impact",
    title: "Agent activity is not the same as impact.",
    description:
      "Calls, tokens and estimated spend describe the work. Understanding its value takes more than a counter.",
    topic: "Teams & measurement",
    minutes: 5,
    art: "measure",
    sections: [
      {
        id: "what-a-counter-can-tell-you",
        title: "What a counter can tell you",
        body: (
          <>
            <p>
              A team dashboard can show that agents are being used. It can show which models appear
              in shared summaries, where recorded activity is concentrated and how estimated spend
              changes. Those are useful operational questions.
            </p>
            <p>
              They are different from asking whether a team is delivering better software. More tool
              calls might represent a larger task, repeated failed attempts or a different agent’s
              way of working. Higher token usage might include substantial cached input. A larger
              patch might be valuable, unnecessary or both in different places.
            </p>
            <p>
              Activity needs context before it becomes an explanation. It should not quietly become
              a performance ranking of developers.
            </p>
          </>
        ),
      },
      {
        id: "why-the-research-varies",
        title: "Why the research varies",
        body: (
          <>
            <p>
              Three randomized field experiments at Microsoft, Accenture and an anonymous Fortune
              100 company covered 4,867 developers. The pooled analysis reported a 26.08% increase
              in completed tasks, with a standard error of 10.3%. Results varied between
              experiments. The research concerned an earlier code-completion assistant.
              <Cite n={1} />
            </p>
            <p>
              METR’s early-2025 trial studied a different setting: 16 experienced maintainers
              completing 246 tasks in repositories they knew well. Allowing AI increased completion
              time by 19%. That is a finding about those participants, tools and tasks—not a
              universal effect of AI.
              <Cite n={2} />
            </p>
            <p>
              In February 2026, METR explained that selection effects and time measurement made its
              newer productivity estimates unreliable. Some developers did not want to participate
              without AI; concurrent agent work also complicated task timing.
              <Cite n={3} />
            </p>
            <p>
              The studies measure different outcomes in different settings. Putting their headline
              percentages on the same chart as though they were interchangeable would conceal the
              most important information.
            </p>
          </>
        ),
      },
      {
        id: "separate-three-questions",
        title: "Separate three questions",
        body: (
          <>
            <dl className="article-definitions">
              <div>
                <dt>What was recorded?</dt>
                <dd>
                  Calls, supported usage fields, failures, edits and available session metadata.
                  Start by checking coverage and missing values.
                </dd>
              </div>
              <div>
                <dt>What did it cost?</dt>
                <dd>
                  Estimate model usage with the applicable price table. Keep input, output and cache
                  categories distinct. Subscription charges and provider invoices may differ from a
                  token-based estimate.
                </dd>
              </div>
              <div>
                <dt>What did the team achieve?</dt>
                <dd>
                  Assess completed work, review effort and quality outcomes. These require other
                  evidence and a suitable comparison; they cannot be derived from token totals
                  alone.
                </dd>
              </div>
            </dl>
            <p>
              A successful command is still a recorded result, rather than a certificate of feature
              correctness. A possible-loop flag is a reason to investigate, rather than proof of
              wasted work.
            </p>
          </>
        ),
      },
      {
        id: "use-visibility-to-ask-better-questions",
        title: "Use visibility to ask better questions",
        body: (
          <>
            <p>
              Quoli keeps detailed evidence local. Team members can choose to share allowed
              session-summary fields so a team owner can review recorded usage across members.
              Prompts, source code, commands, tool output and local file paths are excluded from
              those uploads.
            </p>
            <p>
              That summary view can start a conversation: what changed in the workflow? Why did
              estimated spend rise for this set of sessions? Is a failure pattern worth
              investigating locally?
            </p>
            <p>
              It cannot, by itself, establish that one developer is more productive than another or
              that AI caused a change in delivery performance. Shared summaries also depend on
              participation and capture coverage; a quiet dashboard does not necessarily mean no
              work happened.
            </p>
            <p>
              The useful goal is accountable visibility: know what the numbers describe, keep their
              limits attached and connect them to the work before making decisions.
            </p>
          </>
        ),
      },
    ],
    sources: [
      {
        name: "Cui et al.: three field experiments with software developers",
        url: "https://www.microsoft.com/en-us/research/publication/the-effects-of-generative-ai-on-high-skilled-work-evidence-from-three-field-experiments-with-software-developers/",
        date: "Research page dated June 2025 · experiments used an earlier code-completion assistant",
        method:
          "Three randomized company field experiments; 4,867 developers. Pooled completed-task estimate, with material uncertainty.",
        limit:
          "Historical evidence, not a benchmark of current agents or Quoli. Tasks completed and task completion time are different measures.",
      },
      {
        name: "METR: early-2025 developer productivity study",
        url: "https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/",
        date: "Published July 10, 2025 · tools and data from February–June 2025",
        method:
          "Randomized trial of 16 experienced maintainers completing 246 tasks in familiar open-source repositories.",
        limit:
          "A narrow setting with older tools. Do not generalize the 19% slowdown to all developers or current agents; read the subsequent update.",
      },
      {
        name: "METR: changing the developer productivity experiment",
        url: "https://metr.org/blog/2026-02-24-uplift-update/",
        date: "Published February 24, 2026 · follow-up experiment began August 2025",
        method:
          "Methodological update on a follow-up with returning and newly recruited developers.",
        limit:
          "The authors describe selection effects and concurrent-work timing problems. Raw follow-up estimates are not a reliable current productivity effect.",
      },
    ],
  },
];

export const journalPaths = ["/journal/", ...articles.map((a) => `/journal/${a.slug}/`)];
export function articleAt(pathname: string) {
  return articles.find((a) => pathname === `/journal/${a.slug}/`);
}
