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
import moment from 'moment';
import md5 from 'md5';
import copy from 'copy-to-clipboard';

import '@jetbrains/ring-ui/components/form/form.scss';


import 'file-loader?name=[name].[ext]!../../manifest.json'; // eslint-disable-line import/no-unresolved

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
      onRefresh: () => this.loadCommitsData()
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
          pagesLoaded: 0,
          totalPages: 0
        }
      );
      this.loadCommitsData();
    });

  }

  saveConfig = async () => {
    const {repoUrl, userName, projectId, apiKey} = this.state;

    const urlSplitted = repoUrl.split('/');
    if (urlSplitted.length !== 5) {
      this.setState({
        configurationError: 'Incorrect GitHub repository URL'
      });
      return;
    }

    this.setState({
      configurationError: null,
      projectId: urlSplitted[4],
      userName: urlSplitted[3]
    });

    await this.props.dashboardApi.storeConfig({
      repoUrl, userName, projectId, apiKey
    });
    this.setState({isConfiguring: false});
    this.loadCommitsData();
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
        const totalPages = linkHeader ? linkHeader.match(/page=(\d+)>; *rel="last"/)[1] : 0;
        this.setState(
          {
            commitsData: json,
            pagesLoaded: 1,
            totalPages,
            dataFetchFailed: ''
          });
      }
    } catch (error) {
      this.setState({commitsData: null, dataFetchFailed: true});
    }
  }

  onLoadMoreCommits = async () => {
    const {commitsData, pagesLoaded, userName, projectId, apiKey} = this.state;
    const pageToLoad = pagesLoaded + 1;
    const response =
      await this.getCommitsPage(userName, projectId, apiKey, pageToLoad);

    if (response.ok) {
      const json = await response.json();
      this.setState({
        commitsData: commitsData.concat(json || []),
        pagesLoaded: pageToLoad
      });

    } else {
      this.setState({dataFetchFailed: true});
    }
  };

  editWidgetSettings = () => {
    this.props.dashboardApi.enterConfigMode();
    this.setState({isConfiguring: true});
  };


  renderLoadMore() {
    if (this.state.pagesLoaded < this.state.totalPages) {
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

  /* eslint-disable max-len */
  /* eslint-disable indent */

  /* eslint-disable max-len */
  render() {
    const {isConfiguring, commitsData, dataFetchFailed} = this.state;

    if (isConfiguring) {
      return this.renderConfiguration();
    }

    if (commitsData) {
      return (
        <div className={styles.widget}>
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
                      <div className={styles.commitTitle}>{commitItem.commit.message}</div>
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
                      <div className={styles.copyToClipboardBtn} onClick={() => copy(commitItem.sha)}>
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
            {this.renderLoadMore()}
          </div>
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
