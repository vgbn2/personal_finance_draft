#include <stdio.h>
int nto(int j){
    if(j<2)return 0;
 for(int i=2;i*i<=j;i++){
    if(j%i==0)return 0;
 }
 return 1;
}
int main(){
     int n;scanf("%d",&n);
     for(int o=0;o<=n;o++){
        if(nto(o))
        printf("%d\n",o);
     }

}