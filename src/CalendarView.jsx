import { format } from 'date-fns'

function CalendarView({ items, selectedDate, setSelectedDate }) {
  const getDateItems = (date) => {
    return items.filter(item => item.date === date)
  }

  const getAvailableDates = () => {
    const dates = [...new Set(items.map(item => item.date))].sort().reverse()
    return dates
  }

  return (
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
  )
}

export default CalendarView

