package server

import (
	"net/http"

	"github.com/adityadeshlahre/elbavol/prime/routes/handler"
	"github.com/labstack/echo/v4"
)

func NewServer() *echo.Echo {
	e := echo.New()
	e.GET("/", func(c echo.Context) error {
		return c.String(http.StatusOK, "Prime is running")
	})

	handler.SetProjectRouter(e)
	handler.ProjectRoutes()
	handler.SetChatRouter(e)
	handler.ChatRoutes()

	return e
}
