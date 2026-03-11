#include <stdio.h>

void solve(){
    int n;scanf("%d",&n);
    int a[101],b[101],c[101],eve=0,odd=0;
    for(int i=0;i<n;i++){
        scanf("%d",&a[i]);
        if(a[i]%2==0){
            b[eve++]=a[i];
        }
        else{
            c[odd++]=a[i];
        }
    }
    for(int i=0;i<eve;i++){
        printf("%d ",b[i]);
    }
    printf("\n");
    for(int i=0;i<odd;i++){
        printf("%d ",c[i]);
    }
    printf("\n");
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        solve();
    }
}