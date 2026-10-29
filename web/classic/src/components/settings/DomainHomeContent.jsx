import React, { useEffect, useState } from 'react';
import { Button, Table, Modal, Form, Space } from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../helpers';

const DomainHomeContent = () => {
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const formApi = React.useRef();

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '域名', dataIndex: 'domain' },
    {
      title: '内容预览',
      dataIndex: 'content',
      render: (text) => text?.substring(0, 50) + (text?.length > 50 ? '...' : ''),
    },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => handleEdit(record)}>编辑</Button>
          <Button size="small" type="danger" onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/domain_home_content/');
      if (res.data.success) {
        setContents(res.data.data || []);
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError('加载失败');
    }
    setLoading(false);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setModalVisible(true);
    setTimeout(() => {
      formApi.current?.setValues(item);
    }, 0);
  };

  const handleAdd = () => {
    setEditingItem(null);
    setModalVisible(true);
    setTimeout(() => {
      formApi.current?.reset();
    }, 0);
  };

  const handleSubmit = async () => {
    const values = formApi.current?.getValues();
    if (!values?.domain) {
      showError('请输入域名');
      return;
    }
    try {
      const url = editingItem ? '/api/domain_home_content/' : '/api/domain_home_content/';
      const method = editingItem ? 'put' : 'post';
      const data = editingItem ? { ...values, id: editingItem.id } : values;
      const res = await API[method](url, data);
      if (res.data.success) {
        showSuccess(editingItem ? '更新成功' : '创建成功');
        setModalVisible(false);
        loadData();
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError('操作失败');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除吗？')) return;
    try {
      const res = await API.delete(`/api/domain_home_content/${id}`);
      if (res.data.success) {
        showSuccess('删除成功');
        loadData();
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError('删除失败');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button onClick={handleAdd}>新增域名首页内容</Button>
      </div>
      <Table columns={columns} dataSource={contents} loading={loading} pagination={false} />
      <Modal
        title={editingItem ? '编辑域名首页内容' : '新增域名首页内容'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
      >
        <Form getFormApi={(api) => (formApi.current = api)}>
          <Form.Input
            field="domain"
            label="域名"
            placeholder="例如: example.com 或 example.com:3000"
            rules={[{ required: true, message: '请输入域名' }]}
          />
          <Form.TextArea
            field="content"
            label="首页内容"
            placeholder="支持 Markdown & HTML 代码，或输入链接作为 iframe"
            autosize={{ minRows: 6, maxRows: 12 }}
            style={{ fontFamily: 'JetBrains Mono, Consolas' }}
          />
        </Form>
      </Modal>
    </div>
  );
};

export default DomainHomeContent;
