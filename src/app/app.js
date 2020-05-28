import 'babel-polyfill';
import DashboardAddons from 'hub-dashboard-addons';
import React, {Component} from 'react';
import PropTypes from 'prop-types';
import {render} from 'react-dom';
import Panel from '@jetbrains/ring-ui/components/panel/panel';
import Button from '@jetbrains/ring-ui/components/button/button';
import Input, {Size as InputSize} from '@jetbrains/ring-ui/components/input/input';
import Link from '@jetbrains/ring-ui/components/link/link';
import EmptyWidget, {EmptyWidgetFaces} from '@jetbrains/hub-widget-ui/dist/empty-widget';
import Loader from '@jetbrains/ring-ui/components/loader/loader';
import ButtonGroup, {Caption} from '@jetbrains/ring-ui/components/button-group/button-group';
import moment from 'moment';
import md5 from 'md5';
import copy from 'copy-to-clipboard';


import '@jetbrains/ring-ui/components/form/form.scss';

import styles from './app.css';


const COMMIT_SHA_LEN = 6;

class Widget extends Component {
  static propTypes = {
    dashboardApi: PropTypes.object,
    registerWidgetApi: PropTypes.func
  };

  constructor(props) {
    super(props);
    const {registerWidgetApi} = props;

    this.state = {
      isConfiguring: true,
      dataFetchFailed: false
    };

    registerWidgetApi({
      onConfigure: () => this.setState({isConfiguring: true}),
      onRefresh: () => this.loadData()
    });
  }

  componentDidMount() {
    this.initialize(this.props.dashboardApi);
  }

  initialize(dashboardApi) {
    dashboardApi.readConfig().then(config => {
      if (!config) {
        dashboardApi.enterConfigMode();
        this.setState({isConfiguring: true});
      }
      this.setState(
        {
          isConfiguring: false,
          repoUrl: config.repoUrl,
          userName: config.userName,
          projectId: config.projectId,
          apiKey: config.apiKey,
          commitPagesLoaded: 0,
          commitTotalPages: 0,
          issuePagesLoaded: 0,
          issueTotalPages: 0,
          isIssuesView: false,
          issuesFilter: 'is:open',
          isLoading: true
        }
      );
      this.loadData();
    });

  }

  saveConfig = async () => {
    const {repoUrl, apiKey} = this.state;

    const urlSplitted = repoUrl.split('/');
    if (urlSplitted.length !== 5) {
      this.setState({
        configurationError: 'Incorrect GitHub repository URL'
      });
      return;
    }

    const projectId = urlSplitted[4];
    const userName = urlSplitted[3];

    this.setState({
      configurationError: null,
      projectId,
      userName
    });

    await this.props.dashboardApi.storeConfig({
      repoUrl, userName, projectId, apiKey
    });
    this.setState({isConfiguring: false});
    this.loadData();
  };

  cancelConfig = async () => {
    const {dashboardApi} = this.props;
    const config = await dashboardApi.readConfig();
    if (!config) {
      dashboardApi.removeWidget();
    } else {
      this.setState({isConfiguring: false});
      await dashboardApi.exitConfigMode();
      this.initialize(dashboardApi);
    }
  };

  changeRepoUrl = e => this.setState({
    repoUrl: e.target.value
  });

  changeApiKey = e => this.setState({
    apiKey: e.target.value
  });

  renderConfiguration() {
    const {repoUrl, apiKey, configurationError} =
      this.state;

    return (
      <div className={styles.widget}>
        <div className="ring-form__group">
          <Input
            placeholder="Repository URL"
            onChange={this.changeRepoUrl}
            value={repoUrl}
            size={InputSize.FULL}
            error={configurationError}

          />
        </div>
        <div className="ring-form__group">
          <Input
            placeholder="API key (optional)"
            onChange={this.changeApiKey}
            value={apiKey}
            size={InputSize.FULL}
            type="password"
          />
        </div>
        <Panel className={styles.formFooter}>
          <Button
            primary={true}
            disabled={!repoUrl}
            onClick={this.saveConfig}
          >
            {'Save'}
          </Button>
          <Button onClick={this.cancelConfig}>
            {'Cancel'}
          </Button>
        </Panel>
      </div>
    );
  }


  async getCommitsPage(userName, projectId, apiKey, pageNumber) {
    let requestHeaders = {};
    if (apiKey) {
      requestHeaders = {
        headers: {
          Authorization: `token ${apiKey}`
        }
      };
    }
    return await fetch(`https://api.github.com/repos/${userName}/${projectId}/commits?page=${pageNumber}`, requestHeaders);
  }

  async getIssuesPage(userName, projectId, apiKey, filter, pageNumber) {
    let requestHeaders = {};
    if (apiKey) {
      requestHeaders = {
        headers: {
          Authorization: `token ${apiKey}`
        }
      };
    }
    const query = `repo:${userName}/${projectId} ${filter}`;
    return await fetch(`https://api.github.com/search/issues?q=${query}&page=${pageNumber}`, requestHeaders);
  }

  async loadIssuesData() {
    const {dashboardApi} = this.props;
    const {userName, projectId, apiKey, issuesFilter} = this.state;

    dashboardApi.setTitle(
      projectId
        ? `Project: ${projectId}`
        : 'GitHub commits'
    );
    this.setState({issuesData: null, dataFetchFailed: false});


    try {
      const response =
        await this.getIssuesPage(userName, projectId, apiKey, issuesFilter, 0);
      if (!response.ok) {
        this.setState(
          {issuesData: null, dataFetchFailed: true, isLoading: false});

      } else {
        const json = await response.json();
        const linkHeader = response.headers.get('link');
        const issueTotalPages = linkHeader ? linkHeader.match(/page=(\d+)>; *rel="last"/)[1] : 0;
        this.setState(
          {
            issuesData: json.items,
            issuePagesLoaded: 1,
            issueTotalPages,
            dataFetchFailed: '',
            isLoading: false
          });
      }
    } catch (error) {
      this.setState(
        {issuesData: null, dataFetchFailed: true, isLoading: false});
    }
  }


  async loadCommitsData() {
    const {dashboardApi} = this.props;
    const {userName, projectId, apiKey} = this.state;

    dashboardApi.setTitle(
      projectId
        ? `Project: ${projectId}`
        : 'GitHub commits'
    );
    this.setState({commitsData: null, dataFetchFailed: false});


    try {
      const response =
        await this.getCommitsPage(userName, projectId, apiKey, 0);
      if (!response.ok) {
        this.setState({commitsData: null, dataFetchFailed: true});

      } else {
        const json = await response.json();
        const linkHeader = response.headers.get('link');
        const commitTotalPages = linkHeader ? linkHeader.match(/page=(\d+)>; *rel="last"/)[1] : 0;
        this.setState(
          {
            commitsData: json,
            commitPagesLoaded: 1,
            commitTotalPages,
            dataFetchFailed: ''
          });
      }
    } catch (error) {
      this.setState({commitsData: null, dataFetchFailed: true});
    }
  }

  async loadData() {
    this.loadCommitsData();
    this.loadIssuesData();
  }

  onLoadMoreCommits = async () => {
    const {
      commitsData,
      commitPagesLoaded,
      userName,
      projectId,
      apiKey
    } = this.state;
    const pageToLoad = commitPagesLoaded + 1;
    const response =
      await this.getCommitsPage(userName, projectId, apiKey, pageToLoad);

    if (response.ok) {
      const json = await response.json();
      this.setState({
        commitsData: commitsData.concat(json || []),
        commitPagesLoaded: pageToLoad
      });

    } else {
      this.setState({dataFetchFailed: true});
    }
  };

  onLoadMoreIssues = async () => {
    const {
      issuesData,
      issuePagesLoaded,
      userName,
      projectId,
      apiKey,
      issuesFilter
    } = this.state;

    const pageToLoad = issuePagesLoaded + 1;
    const response =
      await this.getIssuesPage(
        userName, projectId, apiKey, issuesFilter, pageToLoad);

    if (response.ok) {
      const json = await response.json();
      this.setState({
        issuesData: issuesData.concat(json.items || []),
        issuePagesLoaded: pageToLoad
      });

    } else {
      this.setState({dataFetchFailed: true});
    }
  };

  editWidgetSettings = () => {
    this.props.dashboardApi.enterConfigMode();
    this.setState({isConfiguring: true});
  };


  renderLoadMoreCommits() {
    if (this.state.commitPagesLoaded < this.state.commitTotalPages) {
      return (
        <div
          onClick={this.onLoadMoreCommits}
          className={styles.loadMoreLink}
        >
          <Link pseudo={true}>
            {
              'Load more'
            }
          </Link>
        </div>
      );
    } else {
      return (
        <div/>
      );
    }
  }

  renderLoadMoreIssues() {
    if (this.state.issuePagesLoaded < this.state.issueTotalPages) {
      return (
        <div
          onClick={this.onLoadMoreIssues}
          className={styles.loadMoreLink}
        >
          <Link pseudo={true}>
            {
              'Load more'
            }
          </Link>
        </div>
      );
    } else {
      return (
        <div/>
      );
    }
  }

  renderIcon(issueItem) {
    let imageData = '';
    let iconClass = '';
    const author = issueItem.author_association;
    const issueState = issueItem.state;
    if (author === 'OWNER') {
      imageData = 'M7 10h2v2H7v-2zm2-6H7v5h2V4zm1.5 1.5l-1 1L12 9l4-4.5-1-1L12 7l-1.5-1.5zM8 13.7A5.71 5.71 0 012.3 8c0-3.14 2.56-5.7 5.7-5.7 1.83 0 3.45.88 4.5 2.2l.92-.92A6.947 6.947 0 008 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7l-1.52 1.52c-.66 2.41-2.86 4.19-5.48 4.19v-.01z';
      if (issueState === 'closed') {
        iconClass = styles.closedIssueIcon;
      } else {
        iconClass = styles.openIssueIcon;
      }
    } else if (author === 'CONTRIBUTOR') {
      imageData = 'M10 7c-.73 0-1.38.41-1.73 1.02V8C7.22 7.98 6 7.64 5.14 6.98c-.75-.58-1.5-1.61-1.89-2.44A1.993 1.993 0 002 .99C.89.99 0 1.89 0 3a2 2 0 001 1.72v6.56c-.59.35-1 .99-1 1.72 0 1.11.89 2 2 2a1.993 1.993 0 001-3.72V7.67c.67.7 1.44 1.27 2.3 1.69.86.42 2.03.63 2.97.64v-.02c.36.61 1 1.02 1.73 1.02 1.11 0 2-.89 2-2 0-1.11-.89-2-2-2zm-6.8 6c0 .66-.55 1.2-1.2 1.2-.65 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2zM2 4.2C1.34 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zm8 6c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z';
      if (issueState === 'closed') {
        iconClass = styles.mergedRequestIcon;
      } else {
        iconClass = styles.openRequestIcon;
      }
    } else if (author === 'NONE') {
      imageData = 'M11 11.28V5c-.03-.78-.34-1.47-.94-2.06C9.46 2.35 8.78 2.03 8 2H7V0L4 3l3 3V4h1c.27.02.48.11.69.31.21.2.3.42.31.69v6.28A1.993 1.993 0 0010 15a1.993 1.993 0 001-3.72zm-1 2.92c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zM4 3c0-1.11-.89-2-2-2a1.993 1.993 0 00-1 3.72v6.56A1.993 1.993 0 002 15a1.993 1.993 0 001-3.72V4.72c.59-.34 1-.98 1-1.72zm-.8 10c0 .66-.55 1.2-1.2 1.2-.65 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2zM2 4.2C1.34 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z';
      if (issueState === 'closed') {
        iconClass = styles.closedRequestIcon;
      } else {
        iconClass = styles.openRequestIcon;
      }
    }


    return (
      <svg
        className={`${styles.issueIcon} ${iconClass}`}
        viewBox="0 0 14 16"
        version="1.1"
        width="14"
        height="16"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d={imageData}
        />
      </svg>

    );
  }

  changeIssuesFilter = e => this.setState({
    issuesFilter: e.target.value
  });

  applyIssuesFilter = async () => {
    this.setState({issuesData: null, isLoading: true});
    this.loadIssuesData();
  };

  renderIssuesFilter() {
    return (
      <div className={styles.issueFilter}>
        <Input
          className={styles.issueFilterInput}
          placeholder="Issues filter"
          onChange={this.changeIssuesFilter}
          value={this.state.issuesFilter}
          size={InputSize.FULL}
        />
        <Button onClick={this.applyIssuesFilter}>{'Apply'}</Button>
      </div>
    );
  }


  renderIssues(issuesData) {
    if (this.state.isLoading) {
      return (
        <div>
          {this.renderIssuesFilter()}
          <Loader message="Loading..."/>
        </div>
      );
    }
    if (issuesData && issuesData.length > 0) {
      return (
        <div>
          {this.renderIssuesFilter()}
          <div>
            {issuesData.map(issueItem => (
              <div
                key={issueItem.number}
                className={styles.issueRow}
              >
                <div>{this.renderIcon(issueItem)}</div>
                <div className={styles.issueInfo}>
                  <a className={styles.issueTitle} href={`${issueItem.html_url}`}>{`${issueItem.title}`}</a>
                  <div className={styles.stateDescription}>
                    {`#${issueItem.number} by `}
                    <a
                      className={styles.issueAuthorLink}
                      href={`${issueItem.user.html_url}`}
                    >{`${issueItem.user.login}`}</a></div>
                </div>

              </div>
            ))}
            <div>
              {this.renderLoadMoreIssues()}
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className={styles.widget}>
          {this.renderIssuesFilter()}
          <EmptyWidget
            face={EmptyWidgetFaces.OK}
            message="No issues matching filter found."
          />
        </div>
      );
    }
  }

  renderCommits(commitsData) {
    return (
      <div>
        <div className={styles.commitsListing}>
          {commitsData.map(commitItem => (
            <div
              key={commitItem.sha}
              className={styles.commitBlock}
            >
              <div className={styles.commitPanel}>
                <div className={styles.commitCell}>
                  <div className={styles.commitHeader}>
                    <svg
                      className={styles.commitIcon}
                      viewBox="0 0 14 16"
                      version="1.1"
                      width="14"
                      height="16"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.86 7c-.45-1.72-2-3-3.86-3-1.86 0-3.41 1.28-3.86 3H0v2h3.14c.45 1.72 2 3 3.86 3 1.86 0 3.41-1.28 3.86-3H14V7h-3.14zM7 10.2c-1.22 0-2.2-.98-2.2-2.2 0-1.22.98-2.2 2.2-2.2 1.22 0 2.2.98 2.2 2.2 0 1.22-.98 2.2-2.2 2.2z"
                      />
                    </svg>
                    <div className={styles.commitTitle}>
                      {commitItem.commit.message}
                    </div>
                  </div>
                  <div className={styles.commitMeta}>
                    <img
                      className={styles.avatar}
                      src={commitItem.author ? commitItem.author.avatar_url : `https://www.gravatar.com/avatar/${md5(commitItem.commit.author.email)}`}
                    />
                    <div
                      className={styles.commitAuthor}
                    >{`${commitItem.commit.author.name} commited on ${moment(commitItem.commit.author.date).format('MMMM DD, YYYY')}`}</div>
                  </div>
                </div>
                <div className={styles.commitLinksCell}>
                  <div className={styles.commitLinksGroup}>
                    <div
                      className={styles.copyToClipboardBtn}
                      onClick={() => copy(commitItem.sha)}>
                      <svg
                        className={styles.copyToClipboardIcon}
                        viewBox="0 0 12 12"
                        version="1.1"
                        width="9px"
                        height="15px"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M2 13h4v1H2v-1zm5-6H2v1h5V7zm2 3V8l-3 3 3 3v-2h5v-2H9zM4.5 9H2v1h2.5V9zM2 12h2.5v-1H2v1zm9 1h1v2c-.02.28-.11.52-.3.7-.19.18-.42.28-.7.3H1c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h3c0-1.11.89-2 2-2 1.11 0 2 .89 2 2h3c.55 0 1 .45 1 1v5h-1V6H1v9h10v-2zM2 5h8c0-.55-.45-1-1-1H8c-.55 0-1-.45-1-1s-.45-1-1-1-1 .45-1 1-.45 1-1 1H3c-.55 0-1 .45-1 1z"
                        />
                      </svg>
                    </div>
                    <a
                      href={commitItem.html_url}
                      className={styles.revisionLink}
                    >
                      {commitItem.sha.substring(0, COMMIT_SHA_LEN)}
                    </a>
                  </div>
                  <a

                    href={commitItem.html_url.replace('/commit/', '/tree/')}
                    aria-label="Browse the repository at this point in the history"
                    className={styles.viewCodeBtn}
                    rel="nofollow"
                  >
                    <svg
                      className={styles.viewCodeIcon}
                      viewBox="0 0 15 15"
                      version="1.1"
                      width="12px"
                      height="12px"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9.5 3L8 4.5 11.5 8 8 11.5 9.5 13 14 8 9.5 3zm-5 0L0 8l4.5 5L6 11.5 2.5 8 6 4.5 4.5 3z"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div>
          {this.renderLoadMoreCommits()}
        </div>
      </div>);
  }


  renderData(commitsData, issuesData, isIssuesView) {
    if (isIssuesView) {
      return this.renderIssues(issuesData);
    } else {
      return this.renderCommits(commitsData);
    }
  }


  selectCommitsView = async () => {
    this.setState({isIssuesView: false});

  };

  selectIssuesView = async () => {
    this.setState({isIssuesView: true});
  };


  /* eslint-disable max-len */
  /* eslint-disable indent */

  /* eslint-disable max-len */
  render() {
    const {isConfiguring, commitsData, issuesData, dataFetchFailed, isIssuesView} = this.state;

    if (isConfiguring) {
      return this.renderConfiguration();
    }

    if (commitsData) {
      return (
        <div className={styles.widget}>
          <div className={styles.viewButtonGroup}><ButtonGroup>
            <Caption className={styles.buttonGroupCaption}>{'View:'}</Caption>
            <Button active={!isIssuesView} onClick={this.selectCommitsView}>{'Commits'}</Button>
            <Button active={isIssuesView} onClick={this.selectIssuesView}>{'Issues'}</Button>
          </ButtonGroup>
          </div>
          {this.renderData(commitsData, issuesData, isIssuesView)}
        </div>
      );
    }

    if (dataFetchFailed) {
      return (
        <div className={styles.widget}>
          <EmptyWidget
            face={EmptyWidgetFaces.ERROR}
            message="Failed fetching data from GitHub."
          >
            <Link
              pseudo={true}
              onClick={this.editWidgetSettings}
            >
              {'Set repository URL'}
            </Link>
          </EmptyWidget>
        </div>
      );
    } else {
      return (
        <div>
          <Loader message="Loading..."/>
        </div>
      );
    }
  }
}

DashboardAddons.registerWidget((dashboardApi, registerWidgetApi) => render(
  <Widget
    dashboardApi={dashboardApi}
    registerWidgetApi={registerWidgetApi}
  />,
  document.getElementById('app-container')
));
