import EXAM from '../pet/data/exam.json'
import { openFrame } from './box'
import './css/exam.css'
import { button, div } from './dom'

const shuffle = <T>(a: T[]): T[] => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/** The exam on screen; a box removed by something else (closing all windows) no longer counts (#106). */
let open: HTMLElement | undefined

/** The promotion exam of study topic `topic`: three random questions of its bank, all must be right. */
export function openExam(topic: string, pass: () => void): void {
  const bank = EXAM[topic as keyof typeof EXAM] as (typeof EXAM)[keyof typeof EXAM] | undefined
  if (open?.isConnected || !bank?.length) return
  // The bank lists most answers first.
  const questions = shuffle(bank)
    .slice(0, 3)
    .map((q) => ({ ...q, options: shuffle(q.options) }))
  const picked = questions.map(() => -1)
  let at = 0
  const box = div('answerQuestions fC por')
  open = box
  const remove = openFrame(div('ui-exam', box))
  const close = (): void => {
    remove()
    open = undefined
  }

  const go = (d: number) => (): void => {
    if (d < 0 || picked[at] >= 0) at += d
    render()
  }
  const submit = (): void => {
    if (picked[at] < 0) return
    const wrong = questions.flatMap((q, i) => (q.options[picked[i]] === q.answer ? [] : [{ q, mine: q.options[picked[i]] }]))
    if (!wrong.length) {
      close()
      return pass()
    }
    // 失败时在考卷里列出答错的题和正确答案，而不是只弹一句「未通过」(#114)
    box.replaceChildren(
      button('close', close),
      div('a_title', `抱歉未通过！答错 ${wrong.length} 题：`),
      div(
        'a_Question fC f1',
        div(
          'aq_options fC f1 exam-review',
          ...wrong.map(({ q, mine }) => div('aq_title', q.title, div('exam-yours', `你的答案：${mine}`), div('exam-right', `正确答案：${q.answer}`))),
        ),
        div('aq_buts fca', button('fcc wsnw aqb', close, ' 知道了 ')),
      ),
    )
  }

  function render(): void {
    const q = questions[at]
    const last = at === questions.length - 1
    const options = q.options.map((o, i) =>
      button(
        'aq_option fc',
        () => {
          picked[at] = i
          render()
        },
        div(i === picked[at] ? 'choose chooseAQ' : 'choose'),
        div('w0 f1', o),
      ),
    )
    box.replaceChildren(
      button('close', close),
      div('a_title', '升学考试：'),
      div(
        'a_Question fC f1',
        div('aq_title', q.title),
        div('aq_options fccw f1', ...options),
        div(
          'aq_buts fca',
          ...(at ? [button('fcc wsnw aqb', go(-1), ' 上一题 ')] : []),
          last ? button('fcc wsnw aqb', submit, ' 提交 ') : button('fcc wsnw aqb', go(1), ' 下一题 '),
        ),
      ),
    )
  }
  render()
}
