#include <stdio.h>
#include <stdbool.h>
bool check(int n){
    if(n<2)return 0;
    for(int i=2;i*i<=n;i++){
        if(n%i==0)return 0;
    }
    return 1;
}
int main(){
    int a;scanf("%d",&a);
    int ar[30][30],hang=0,max=0;
    for(int i=0;i<a;i++){
        int dem=0;
        for(int j=0;j<a;j++){
            scanf("%d",&ar[i][j]);
            if(check(ar[i][j])){
                dem++;
            }
         }
        if(dem>max){
            max=dem;
            hang=i;
        }
    }
  printf("%d\n",hang+1);
        for(int j=0;j<a;j++){
            if(check(ar[hang][j]))
            printf("%d ",ar[hang][j]);
        }
    }

