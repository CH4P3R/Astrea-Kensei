import { useId, useRef, useState } from 'react'
import Modal from '../common/Modal.jsx'
import AboutContent from './AboutContent.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function AboutModal({ onClose }) {
  const { t } = useTranslation()
  const titleId = useId()
  const descriptionId = useId()
  const closeRef = useRef(null)
  const [closing, setClosing] = useState(false)
  return <Modal size="large" className="about-modal" labelledBy={titleId} describedBy={descriptionId}
    initialFocusRef={closeRef} blocked={closing} closing={closing} onExited={onClose}
    onClose={() => setClosing(true)}
    footer={<button ref={closeRef} type="button" className="about-close" onClick={() => setClosing(true)}>
      {t('about.close')}
    </button>}>
    <AboutContent titleId={titleId} descriptionId={descriptionId} />
  </Modal>
}
