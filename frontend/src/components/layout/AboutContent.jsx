import useTranslation from '../../i18n/useTranslation.js'
import { projectRepository, teamMembers } from '../../config/team.js'
import GithubIcon from '../common/GithubIcon.jsx'
import ExternalLink from '../common/ExternalLink.jsx'

export default function AboutContent({ titleId, descriptionId }) {
  const { t } = useTranslation()
  return <section className="about-content" aria-labelledby={titleId}>
    <h1 id={titleId}>{t('about.title')}</h1>
    <p id={descriptionId} className="about-summary">{t('about.description')}</p>
    <h2 className="about-heading">{t('about.team')}</h2>
    <ul className="about-team">
      {teamMembers.map((member) => <li key={member.profile}>
        <img src={member.photo} alt={t('about.photo', { name: member.name })} width="64" height="64" loading="lazy" />
        <div className="about-team__details">
          <span className="about-team__name">{member.name}</span>
          <span lang="en">{member.role}</span>
        </div>
        <a className="about-github" href={member.profile} target="_blank" rel="noopener noreferrer"
          aria-label={t('about.profile', { name: member.name })} title={t('about.profile', { name: member.name })}>
          <GithubIcon />
        </a>
      </li>)}
    </ul>
    <div className="about-repository">
      <h2 className="about-heading">{t('about.repository')}</h2>
      <p>{t('about.repositoryDescription')}</p>
      <a href={projectRepository} target="_blank" rel="noopener noreferrer">
        <GithubIcon />{t('about.repositoryLink')}<ExternalLink />
      </a>
    </div>
  </section>
}
