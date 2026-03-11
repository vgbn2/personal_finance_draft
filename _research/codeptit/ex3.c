#include <stdio.h>
typedef long long ll;
ll ucln(ll a,ll b){
    while(b!=0){
        int c=a%b;
        a=b;
        b=a;
    }
    return a;
}
int main(){
    int L,R;
    scanf("%d%d",&L ,&R);
        int x,y,z;
    for(int i=L;i<R;++i){
        for(int j=i+1;j<R;i++){
            for(int o=j+1;o<+R;o++){
                if(ucln(i,j)==1&&ucln(j,o)==1){
                    printf("%d%d%d",i,j,o);
                }
            }
        }
    }
}