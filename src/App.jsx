import { useState, useEffect } from 'react'
import { format, parseISO, isToday, isBefore, startOfDay } from 'date-fns'
import * as XLSX from 'xlsx'
import { supabase, retryRequest } from './supabaseClient'
import './App.css'

const CATEGORIES = [
  { id: 'params', name: '参数待复核', color: '#00d9ff' },
  { id: 'night', name: '晚班需关注', color: '#fbbf24' },
  { id: 'morning', name: '次日早班需关注', color: '#10b981' },
  { id: 'other', name: '其他待办事项', color: '#7c3aed' }
]

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [loginName, setLoginName] = useState('')
  const [view, setView] = useState('today')
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [syncStatus, setSyncStatus] = useState('synced') // synced, syncing, offline
  const [activeCategory, setActiveCategory] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({
    category: 'params',
    content: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    plannedCompletionTime: ''
  })

  // 从本地缓存加载数据
  const loadFromCache = () => {
    const cached = localStorage.getItem('checklistItems_cache')
    if (cached) {
      try {
        const cachedItems = JSON.parse(cached)
        setItems(cachedItems)
        return cachedItems
      } catch (e) {
        console.error('加载缓存失败:', e)
      }
    }
    return []
  }

  // 保存到本地缓存
  const saveToCache = (data) => {
    try {
      localStorage.setItem('checklistItems_cache', JSON.stringify(data))
      localStorage.setItem('checklistItems_cache_time', new Date().toISOString())
    } catch (e) {
      console.error('保存缓存失败:', e)
    }
  }

  // 从云端加载数据（带重试）
  const loadItems = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true)
      setSyncStatus('syncing')
      
      const result = await retryRequest(async () => {
        return await supabase
          .from('checklist_items')
          .select('*')
          .order('created_at', { ascending: false })
      })

      if (result.error) throw result.error

      const formattedItems = result.data.map(item => ({
        id: item.id,
        category: item.category,
        content: item.content,
        registrant: item.registrant,
        registeredAt: item.registered_at,
        executor: item.executor,
        date: item.date,
        plannedCompletionTime: item.planned_completion_time,
        completed: item.completed,
        completedAt: item.completed_at,
        completedBy: item.completed_by
      }))

      setItems(formattedItems)
      saveToCache(formattedItems)
      setIsOnline(true)
      setSyncStatus('synced')
    } catch (error) {
      console.error('加载数据失败:', error)
      setIsOnline(false)
      setSyncStatus('offline')
      
      // 使用缓存数据
      const cachedItems = loadFromCache()
      if (cachedItems.length > 0) {
        console.log('使用缓存数据')
      }
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser')
    if (savedUser) {
      setCurrentUser(savedUser)
    }
    
    // 先加载缓存
    loadFromCache()
    
    // 然后尝试从云端加载
    loadItems()

    // 设置定期同步（每30秒）
    const syncInterval = setInterval(() => {
      if (isOnline) {
        loadItems(false)
      }
    }, 30000)

    // 监听网络状态
    const handleOnline = () => {
      setIsOnline(true)
      loadItems(false)
    }
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearInterval(syncInterval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleLogin = () => {
    if (!loginName.trim()) {
      alert('请输入用户名')
      return
    }
    setCurrentUser(loginName.trim())
    localStorage.setItem('currentUser', loginName.trim())
    setLoginName('')
  }

  const handleLogout = () => {
    if (confirm('确定退出登录？')) {
      setCurrentUser(null)
      localStorage.removeItem('currentUser')
    }
  }

  const addItem = async () => {
    const isOtherCategory = formData.category === 'other'
    
    if (!formData.content) {
      alert('请填写事项内容')
      return
    }

    const newItem = {
      category: formData.category,
      content: formData.content,
      registrant: currentUser,
      registered_at: new Date().toISOString(),
      executor: isOtherCategory ? formData.executor : null,
      date: formData.date,
      planned_completion_time: formData.plannedCompletionTime || null,
      completed: false
    }

    try {
      setSyncStatus('syncing')
      
      if (editingItem) {
        // 更新
        const result = await retryRequest(async () => {
          return await supabase
            .from('checklist_items')
            .update({
              content: formData.content,
              date: formData.date,
              planned_completion_time: formData.plannedCompletionTime || null,
              executor: isOtherCategory ? formData.executor : null
            })
            .eq('id', editingItem.id)
        })

        if (result.error) throw result.error
        setEditingItem(null)
      } else {
        // 新增
        const result = await retryRequest(async () => {
          return await supabase
            .from('checklist_items')
            .insert([newItem])
        })

        if (result.error) throw result.error
      }

      setActiveCategory(null)
      setFormData({
        category: 'params',
        content: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        plannedCompletionTime: ''
      })

      await loadItems(false)
      setSyncStatus('synced')
    } catch (error) {
      console.error('保存失败:', error)
      setSyncStatus('offline')
      alert('保存失败，请检查网络连接后重试')
    }
  }

  const openAddForm = (categoryId) => {
    setActiveCategory(categoryId)
    setEditingItem(null)
    setFormData({
      category: categoryId,
      content: '',
      executor: '',
      date: view === 'calendar' ? selectedDate : format(new Date(), 'yyyy-MM-dd'),
      plannedCompletionTime: ''
    })
  }

  const openEditForm = (item) => {
    setEditingItem(item)
    setActiveCategory(null)
    setFormData({
      category: item.category,
      content: item.content,
      executor: item.executor || '',
      date: item.date,
      plannedCompletionTime: item.plannedCompletionTime || ''
    })
  }

  const cancelAdd = () => {
    setActiveCategory(null)
    setEditingItem(null)
  }

  const toggleComplete = async (id) => {
    const item = items.find(i => i.id === id)
    if (!item) return

    try {
      setSyncStatus('syncing')
      
      const result = await retryRequest(async () => {
        return await supabase
          .from('checklist_items')
          .update({
            completed: !item.completed,
            completed_at: !item.completed ? new Date().toISOString() : null,
            completed_by: !item.completed ? currentUser : null
          })
          .eq('id', id)
      })

      if (result.error) throw result.error

      await loadItems(false)
      setSyncStatus('synced')
    } catch (error) {
      console.error('更新状态失败:', error)
      setSyncStatus('offline')
      alert('更新失败，请检查网络连接后重试')
    }
  }

  const exportToExcel = () => {
    const exportData = items.map(item => {
      const category = CATEGORIES.find(c => c.id === item.category)
      return {
        '类别': category?.name || '',
        '事项内容': item.content,
        '登记人': item.registrant,
        '登记时间': format(parseISO(item.registeredAt), 'yyyy-MM-dd HH:mm'),
        '执行人': item.executor || '',
        '执行日期': item.date,
        '计划完成时间': item.plannedCompletionTime ? format(parseISO(item.plannedCompletionTime), 'yyyy-MM-dd HH:mm') : '',
        '状态': item.completed ? '已完成' : '未完成',
        '完成时间': item.completedAt ? format(parseISO(item.completedAt), 'yyyy-MM-dd HH:mm') : '',
        '完成人': item.completedBy || ''
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '清单数据')
    
    const fileName = `清单数据_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const deleteItem = async (id) => {
    if (!confirm('确定删除此事项？')) return

    try {
      setSyncStatus('syncing')
      
      const result = await retryRequest(async () => {
        return await supabase
          .from('checklist_items')
          .delete()
          .eq('id', id)
      })

      if (result.error) throw result.error

      await loadItems(false)
      setSyncStatus('synced')
    } catch (error) {
      console.error('删除失败:', error)
      setSyncStatus('offline')
      alert('删除失败，请检查网络连接后重试')
    }
  }

  const manualSync = () => {
    loadItems(false)
  }

  const getTodayItems = () => {
    return items.filter(item => isToday(parseISO(item.date)))
  }

  const getUncompletedItems = () => {
    const today = startOfDay(new Date())
    return items.filter(item => 
      !item.completed && isBefore(parseISO(item.date), today)
    )
  }

  const getDateItems = (date) => {
    return items.filter(item => item.date === date)
  }

  const getAvailableDates = () => {
    const dates = [...new Set(items.map(item => item.date))].sort().reverse()
    return dates
  }

  const displayItems = view === 'today' ? getTodayItems() : 
                       view === 'history' ? getUncompletedItems() :
                       view === 'calendar' ? getDateItems(selectedDate) : []

  if (!currentUser) {
    return (
      <div className="login-container">
        <div className="login-box fade-in">
          <h1>📋 在线清单管理系统</h1>
          <p className="login-subtitle">请登录以继续</p>
          <div className="login-form">
            <input 
              type="text"
              value={loginName}
              onChange={e => setLoginName(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleLogin()}
              placeholder="请输入用户名"
              className="login-input"
              autoFocus
            />
            <button onClick={handleLogin} className="login-btn">登录</button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-box fade-in">
          <h1>📋 在线清单管理系统</h1>
          <p className="login-subtitle">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header fade-in">
        <div className="header-content">
          <div>
            <h1>📋 在线清单管理系统</h1>
            <p className="subtitle">高效管理每日工作事项</p>
          </div>
          <div className="user-section">
            <div className="sync-status">
              {syncStatus === 'synced' && isOnline && <span className="status-badge synced">✓ 已同步</span>}
              {syncStatus === 'syncing' && <span className="status-badge syncing">⟳ 同步中...</span>}
              {syncStatus === 'offline' && <span className="status-badge offline">⚠ 离线模式</span>}
              {!isOnline && <button onClick={manualSync} className="sync-btn" title="手动同步">🔄</button>}
            </div>
            <span className="user-name">👤 {currentUser}</span>
            <button onClick={handleLogout} className="logout-btn">退出</button>
          </div>
        </div>
      </header>

      <nav className="nav fade-in">
        <button 
          className={view === 'today' ? 'active' : ''} 
          onClick={() => setView('today')}
        >
          今日事项
        </button>
        <button 
          className={view === 'history' ? 'active' : ''} 
          onClick={() => setView('history')}
        >
          历史未完成 {getUncompletedItems().length > 0 && `(${getUncompletedItems().length})`}
        </button>
        <button 
          className={view === 'calendar' ? 'active' : ''} 
          onClick={() => setView('calendar')}
        >
          📅 日历查看
        </button>
        <button onClick={exportToExcel} className="export-btn" title="导出Excel">
          📊 导出
        </button>
      </nav>

      {view === 'calendar' && (
        <div className="calendar-view fade-in">
          <div className="date-selector">
            <label className="date-selector-label">选择日期：</label>
            <input 
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="date-selector-input"
            />
            <div className="quick-dates">
              {getAvailableDates().slice(0, 10).map(date => {
                const itemCount = getDateItems(date).length
                const completedCount = getDateItems(date).filter(item => item.completed).length
                return (
                  <button
                    key={date}
                    className={`quick-date-btn ${selectedDate === date ? 'active' : ''}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span className="date-text">{date}</span>
                    <span className="date-stats">{completedCount}/{itemCount}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="calendar-stats">
            <div className="stat-card">
              <span className="stat-label">总事项</span>
              <span className="stat-value">{getDateItems(selectedDate).length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">已完成</span>
              <span className="stat-value completed">{getDateItems(selectedDate).filter(item => item.completed).length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">未完成</span>
              <span className="stat-value pending">{getDateItems(selectedDate).filter(item => !item.completed).length}</span>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        {CATEGORIES.map((category, idx) => {
          const categoryItems = displayItems.filter(item => item.category === category.id)
          const isOtherCategory = category.id === 'other'
          
          return (
            <section key={category.id} className={`category-section ${isOtherCategory ? 'other-category' : ''} slide-in`} style={{ animationDelay: `${idx * 0.1}s` }}>
              <div className="category-header" style={{ borderLeftColor: category.color }}>
                <h2>{category.name}</h2>
                <div className="header-actions">
                  <span className="count">{categoryItems.length}</span>
                  <button 
                    className="quick-add-btn" 
                    onClick={() => openAddForm(category.id)}
                    title="快速添加"
                  >
                    +
                  </button>
                </div>
              </div>
              
              <div className="items-list">
                {(activeCategory === category.id || (editingItem && editingItem.category === category.id)) && (
                  <div className="inline-form">
                    <textarea 
                      value={formData.content}
                      onChange={e => setFormData({...formData, content: e.target.value})}
                      placeholder="请输入事项内容..."
                      rows="2"
                      className="inline-input"
                    />

                    {isOtherCategory && (
                      <input 
                        type="text"
                        value={formData.executor}
                        onChange={e => setFormData({...formData, executor: e.target.value})}
                        placeholder="执行人"
                        className="inline-input"
                      />
                    )}

                    {isOtherCategory ? (
                      <div className="inline-row">
                        <div className="date-input-wrapper">
                          <label className="date-label">📅 执行日期</label>
                          <input 
                            type="date"
                            value={formData.date}
                            onChange={e => setFormData({...formData, date: e.target.value})}
                            className="inline-input small"
                          />
                        </div>
                        <div className="date-input-wrapper">
                          <label className="date-label">⏰ 计划完成时间</label>
                          <input 
                            type="datetime-local"
                            value={formData.plannedCompletionTime}
                            onChange={e => setFormData({...formData, plannedCompletionTime: e.target.value})}
                            className="inline-input small"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="date-input-wrapper">
                        <label className="date-label">📅 执行日期</label>
                        <input 
                          type="date"
                          value={formData.date}
                          onChange={e => setFormData({...formData, date: e.target.value})}
                          className="inline-input"
                        />
                      </div>
                    )}
                    
                    <div className="inline-actions">
                      <button className="btn-inline-cancel" onClick={cancelAdd}>取消</button>
                      <button className="btn-inline-submit" onClick={addItem}>
                        {editingItem ? '保存' : '添加'}
                      </button>
                    </div>
                  </div>
                )}

                {categoryItems.length === 0 && activeCategory !== category.id && !(editingItem && editingItem.category === category.id) ? (
                  <div className="empty-state">暂无事项</div>
                ) : (
                  categoryItems.map(item => (
                    editingItem && editingItem.id === item.id ? null : (
                      <div key={item.id} className={`item-card-compact ${item.completed ? 'completed' : ''}`}>
                        <input 
                          type="checkbox" 
                          checked={item.completed}
                          onChange={() => toggleComplete(item.id)}
                          className="checkbox"
                        />
                        <div className="item-main">
                          <span className="item-content">{item.content}</span>
                          <div className="item-info">
                            <span className="info-item">📝 {item.registrant}</span>
                            {item.executor && <span className="info-item">👤 {item.executor}</span>}
                            <span className="info-item">🕐 {format(parseISO(item.registeredAt), 'MM-dd HH:mm')}</span>
                            {item.completed && item.completedBy && (
                              <span className="info-item completed-tag">✓ {item.completedBy} {format(parseISO(item.completedAt), 'MM-dd HH:mm')}</span>
                            )}
                            {item.completed && !item.completedBy && (
                              <span className="info-item completed-tag">✓ {format(parseISO(item.completedAt), 'MM-dd HH:mm')}</span>
                            )}
                            {item.date !== format(new Date(), 'yyyy-MM-dd') && (
                              <span className="info-item date-badge">📅 {item.date}</span>
                            )}
                            {item.plannedCompletionTime && (
                              <span className="info-item planned-badge">⏰ {format(parseISO(item.plannedCompletionTime), 'MM-dd HH:mm')}</span>
                            )}
                          </div>
                        </div>
                        <button className="edit-btn" onClick={() => openEditForm(item)} title="编辑">✏️</button>
                        <button className="delete-btn" onClick={() => deleteItem(item.id)}>×</button>
                      </div>
                    )
                  ))
                )}
              </div>
            </section>
          )
        })}
      </main>
    </div>
  )
}

export default App
