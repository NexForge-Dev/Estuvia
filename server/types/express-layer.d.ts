// server/app.js importa o Layer interno do Express (sem tipos próprios).
declare module 'express/lib/router/layer.js' {
  const Layer: any;
  export default Layer;
}
