/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useState, useContext, useMemo } from 'react';
import {
  Button,
  Modal,
  Empty,
  Tabs,
  TabPane,
  Timeline,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, getRelativeTime } from '../../helpers';
import { marked } from 'marked';
import {
  IllustrationNoContent,
  IllustrationNoContentDark,
} from '@douyinfe/semi-illustrations';
import { StatusContext } from '../../context/Status';
import { Bell, Megaphone, BookOpen, MousePointerClick } from 'lucide-react';

const NoticeModal = ({
  visible,
  onClose,
  isMobile,
  defaultTab = 'inApp',
  unreadKeys = [],
}) => {
  const { t } = useTranslation();
  const [noticeContent, setNoticeContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);

  const [statusState] = useContext(StatusContext);

  const announcements = statusState?.status?.announcements || [];
  const tutorialLink = statusState?.status?.tutorial_link || '';
  
  // 解析顶栏模块配置，检查接入教程是否启用
  const headerNavModules = useMemo(() => {
    try {
      const config = statusState?.status?.HeaderNavModules;
      if (config) {
        return JSON.parse(config);
      }
    } catch (e) {}
    return { tutorial: true };
  }, [statusState?.status?.HeaderNavModules]);
  
  const showTutorialLink = tutorialLink && headerNavModules?.tutorial !== false;

  const unreadSet = useMemo(() => new Set(unreadKeys), [unreadKeys]);

  const getKeyForItem = (item) =>
    `${item?.publishDate || ''}-${(item?.content || '').slice(0, 30)}`;

  const processedAnnouncements = useMemo(() => {
    return (announcements || []).slice(0, 20).map((item) => {
      const pubDate = item?.publishDate ? new Date(item.publishDate) : null;
      const absoluteTime =
        pubDate && !isNaN(pubDate.getTime())
          ? `${pubDate.getFullYear()}-${String(pubDate.getMonth() + 1).padStart(2, '0')}-${String(pubDate.getDate()).padStart(2, '0')} ${String(pubDate.getHours()).padStart(2, '0')}:${String(pubDate.getMinutes()).padStart(2, '0')}`
          : item?.publishDate || '';
      return {
        key: getKeyForItem(item),
        type: item.type || 'default',
        time: absoluteTime,
        content: item.content,
        extra: item.extra,
        relative: getRelativeTime(item.publishDate),
        isUnread: unreadSet.has(getKeyForItem(item)),
      };
    });
  }, [announcements, unreadSet]);

  const handleCloseTodayNotice = () => {
    const today = new Date().toDateString();
    localStorage.setItem('notice_close_date', today);
    onClose();
  };

  const displayNotice = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/notice');
      const { success, message, data } = res.data;
      if (success) {
        if (data !== '') {
          const htmlNotice = marked.parse(data);
          setNoticeContent(htmlNotice);
        } else {
          setNoticeContent('');
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      displayNotice();
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, visible]);

  const renderMarkdownNotice = () => {
    if (loading) {
      return (
        <div className='py-12'>
          <Empty description={t('加载中...')} />
        </div>
      );
    }

    if (!noticeContent) {
      return (
        <div className='py-12'>
          <Empty
            image={
              <IllustrationNoContent style={{ width: 150, height: 150 }} />
            }
            darkModeImage={
              <IllustrationNoContentDark style={{ width: 150, height: 150 }} />
            }
            description={t('暂无公告')}
          />
        </div>
      );
    }

    return (
      <div
        dangerouslySetInnerHTML={{ __html: noticeContent }}
        className='notice-content-scroll max-h-[55vh] overflow-y-auto pr-2'
      />
    );
  };

  const renderAnnouncementTimeline = () => {
    if (processedAnnouncements.length === 0) {
      return (
        <div className='py-12'>
          <Empty
            image={
              <IllustrationNoContent style={{ width: 150, height: 150 }} />
            }
            darkModeImage={
              <IllustrationNoContentDark style={{ width: 150, height: 150 }} />
            }
            description={t('暂无系统公告')}
          />
        </div>
      );
    }

    return (
      <div className='max-h-[55vh] overflow-y-auto pr-2 card-content-scroll'>
        <Timeline mode='left'>
          {processedAnnouncements.map((item, idx) => {
            const htmlContent = marked.parse(item.content || '');
            const htmlExtra = item.extra ? marked.parse(item.extra) : '';
            return (
              <Timeline.Item
                key={idx}
                type={item.type}
                time={`${item.relative ? item.relative + ' ' : ''}${item.time}`}
                extra={
                  item.extra ? (
                    <div
                      className='text-xs text-gray-500'
                      dangerouslySetInnerHTML={{ __html: htmlExtra }}
                    />
                  ) : null
                }
                className={item.isUnread ? '' : ''}
              >
                <div>
                  <div
                    className={item.isUnread ? 'shine-text' : ''}
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                  />
                </div>
              </Timeline.Item>
            );
          })}
        </Timeline>
      </div>
    );
  };

  const renderBody = () => {
    if (activeTab === 'inApp') {
      return renderMarkdownNotice();
    }
    return renderAnnouncementTimeline();
  };

  return (
    <Modal
      title={
        <div className='flex items-center justify-between w-full'>
          <span>{t('系统公告')}</span>
          <Tabs activeKey={activeTab} onChange={setActiveTab} type='button'>
            <TabPane
              tab={
                <span className='flex items-center gap-1'>
                  <Bell size={14} /> {t('通知')}
                </span>
              }
              itemKey='inApp'
            />
            <TabPane
              tab={
                <span className='flex items-center gap-1'>
                  <Megaphone size={14} /> {t('系统公告')}
                </span>
              }
              itemKey='system'
            />
          </Tabs>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      centered
      footer={
        <div className='flex flex-col gap-3'>
          <div className='flex justify-end gap-2'>
            <Button type='secondary' onClick={handleCloseTodayNotice}>
              {t('今日关闭')}
            </Button>
            <Button type='primary' onClick={onClose}>
              {t('关闭公告')}
            </Button>
          </div>
          {showTutorialLink && (
            <>
              <style>
                {`
                  @keyframes tutorialPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                  }
                  @keyframes clickHand {
                    0%, 100% { transform: translateY(0) rotate(-10deg); }
                    50% { transform: translateY(3px) rotate(-10deg) scale(0.95); }
                  }
                  @keyframes shimmer {
                    0% { background-position: -200% center; }
                    100% { background-position: 200% center; }
                  }
                  .tutorial-link-btn {
                    animation: tutorialPulse 2s ease-in-out infinite;
                  }
                  .tutorial-link-btn:hover {
                    animation: none;
                  }
                  .click-hand {
                    animation: clickHand 1s ease-in-out infinite;
                  }
                `}
              </style>
              <a
                href={tutorialLink}
                target='_blank'
                rel='noopener noreferrer'
                className='tutorial-link-btn'
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '12px 20px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #6366f1 100%)',
                  backgroundSize: '200% auto',
                  color: '#ffffff',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #4f46e5 100%)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #6366f1 100%)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.4)';
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                }}
              >
                <BookOpen size={18} />
                <span>{t('新手必看教程')}：{t('注册-创建令牌-调用-充值-对公')}</span>
                <MousePointerClick size={18} className='click-hand' style={{ marginLeft: '4px' }} />
              </a>
            </>
          )}
        </div>
      }
      size={isMobile ? 'full-width' : 'large'}
    >
      {renderBody()}
    </Modal>
  );
};

export default NoticeModal;
