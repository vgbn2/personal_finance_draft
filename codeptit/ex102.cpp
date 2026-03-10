#include <stdio.h>
int fibonaci(int n){
int a = 0, b = 1, next;
if(n<2)return n;
while(b<n) {
    next = a + b;
    a = b;
    b = next;
}
return b;
}
int main() {
    int t,n;
    scanf("%d",&t);
for(int i=0;i<t;i++){
    scanf("%d", &n);
    for(int i=1;i<=n;i++){
    printf("%d\n",fibonaci(i));
    }
}
}