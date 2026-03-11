#include <stdio.h>
#include <stdbool.h>
#include <math.h>
bool ktnt(int n){
    if(n<2)
    return false;
for(int i=2;i<=sqrt(n);i++){
    if(n%i==0){
        return false;
    }
    return true;
}
}
void solve(){
    int n;scanf("%d",&n);
    int a[101],b[101],prim=0;
    for(int i=0;i<n;i++){
        scanf("%d",&a[i]);
    }
    for(int i=0;i<n;i++){
        if(ktnt(a[i])){
            b[prim++]=a[i];
        }
    }
    for(int i=0;i<prim;i++){
        printf("%d ",b[i]);
    }
    printf("\n");
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        solve();
    }
}