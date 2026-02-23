import { useState, useEffect } from 'react'
import { format, parseISO, isToday, isBefore, startOfDay } from 'date-fns'
import * as XLSX from 'xlsx'
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
  const [activeCategory, setActiveCategory] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({
    category: 'params',
    content: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    plannedCompletionTime: ''
  })

  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser')
    if (savedUser) {
      setCurrentUser(savedUser)
    }
    
    const saved = localStorage.getItem('checklistItems')
    if (saved) {
      setItems(JSON.parse(saved))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('checklistItems', JSON.stringify(items))
  }, [items])

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

  const addItem = () => {
    const isOtherCategory = formData.category === 'other'
    
    if (!formData.content) {
      alert('请填写事项内容')
      return
    }

    if (editingItem) {
      setItems(items.map(item => 
        item.id === editingItem.id 
          ? {
              ...item,
              content: formData.content,
              date: formData.date,
              plannedCompletionTime: formData.plannedCompletionTime,
              executor: isOtherCategory ? formData.executor : item.executor
            }
          : item
      ))
      setEditingItem(null)
    } else {
      const newItem = {
        id: Date.now(),
        ...formData,
        registrant: currentUser,
        registeredAt: new Date().toISOString(),
        completed: false,
        completedAt: null,
        completedBy: null,
        executor: isOtherCategory ? formData.executor : null
      }
      setItems([...items, newItem])
    }

    setActiveCategory(null)
    setFormData({
      category: 'params',
      content: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      plannedCompletionTime: ''
    })
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

  const toggleComplete = (id) => {
    setItems(items.map(item => 
      item.id === id 
        ? { 
            ...item, 
            completed: !item.completed, 
            completedAt: !item.completed ? new Date().toISOString() : null,
            completedBy: !item.completed ? currentUser : null
          }
        : item
    ))
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

  // 导出数据为JSON（用于团队同步）
  const exportData = () => {
    const dataStr = JSON.stringify(items, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `清单数据_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 导入数据（用于团队同步）
  const importData = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedItems = JSON.parse(e.target.result)
        
        // 合并数据：保留本地新数据，导入远程数据
        const mergedItems = [...items]
        const existingIds = new Set(items.map(item => item.id))
        
        importedItems.forEach(importedItem => {
          if (!existingIds.has(importedItem.id)) {
            mergedItems.push(importedItem)
          } else {
            // 如果ID存在，更新为最新的数据
            const index = mergedItems.findIndex(item => item.id === importedItem.id)
            if (index !== -1) {
              mergedItems[index] = importedItem
            }
          }
        })
        
        setItems(mergedItems)
        alert('数据导入成功！')
      } catch (error) {
        alert('导入失败，请确保文件格式正确')
      }
    }
    reader.readAsText(file)
    event.target.value = '' // 清空input，允许重复导入同一文件
  }

  const deleteItem = (id) => {
    if (confirm('确定删除此事项？')) {
      setItems(items.filter(item => item.id !== id))
    }
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

  return (
    <div className="app">
      <header className="header fade-in">
        <div className="header-content">
          <div>
            <h1>📋 在线清单管理系统</h1>
            <p className="subtitle">高效管理每日工作事项</p>
          </div>
          <div className="user-section">
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
        <div className="nav-actions">
          <label className="import-btn" title="导入数据">
            📥 导入
            <input 
              type="file" 
              accept=".json" 
              onChange={importData}
              style={{ display: 'none' }}
            />
          </label>
          <button onClick={exportData} className="export-btn" title="导出数据（JSON）">
            💾 导出数据
          </button>
          <button onClick={exportToExcel} className="export-btn" title="导出Excel">
            📊 导出Excel
          </button>
        </div>
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
